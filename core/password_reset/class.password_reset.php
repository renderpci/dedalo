<?php declare(strict_types=1);
/**
* CLASS PASSWORD_RESET
* Self-service "forgot password" recovery flow for Dédalo.
*
* A user who has lost their password requests a one-time 8-digit code from the
* login screen. The code is emailed (via dd_mailer over SMTP) to the address
* stored on the user record (component_email, dd134). The user types the code
* back into the form together with a new password; on a correct, unexpired code
* the password component (dd133) is updated with a fresh Argon2id hash.
*
* Security model (mirrors login::Login() SEC-019):
* - The 8-digit code is NEVER stored in plain text and NEVER written to the user
*   record / matrix / Time Machine history. Only its password_hash() digest is
*   persisted, in a short-lived JSON file under
*   DEDALO_CACHE…/dd_password_reset/<sha1(reset_id)>.json (parallel to the login
*   throttle store dd_login_attempts/). The file holds { user_id, code_hash,
*   expires, attempts }.
* - The only secret is the emailed code. The reset_id returned to the client is
*   an opaque, non-secret correlation token (the file-store key).
* - Anti-enumeration: request() ALWAYS returns the same generic response shape
*   regardless of whether the identifier matches an account, the account is
*   active, has an email, matches multiple users, or the mail send fails. The
*   same 2-second delay used by login::Login() is applied on the no-op path.
* - Brute-force resistance against the 1e8 code space: short TTL
*   (DEDALO_PWRESET_CODE_TTL, default 600s), a low per-code attempt cap
*   (DEDALO_PWRESET_MAX_ATTEMPTS, default 5; the entry is deleted once reached),
*   and a per-(identifier|ip) request throttle plus a per-(reset_id|ip) verify
*   throttle reusing the login file-store pattern.
* - A successful reset does NOT establish a session; the user logs in normally.
*
* Scope: forgot-password recovery only. Logged-in users change their password
* through tool_user_admin (editing component dd133 directly).
*
* @package Dédalo
* @subpackage Core
*/
final class password_reset {



	/**
	* Per-code lifetime in seconds before the emailed code expires.
	* Overridable via the DEDALO_PWRESET_CODE_TTL config constant.
	*/
	const CODE_TTL_SECONDS = 600;

	/**
	* Maximum wrong-code guesses allowed against a single issued code before the
	* stored entry is deleted and the user must request a new code.
	* Overridable via the DEDALO_PWRESET_MAX_ATTEMPTS config constant.
	*/
	const MAX_VERIFY_ATTEMPTS = 5;

	/**
	* Sliding window (seconds) and cap for the per-(identifier|ip) request throttle
	* and the per-(reset_id|ip) verify throttle. These cap how many codes can be
	* requested / verified from one IP within the window.
	*/
	const THROTTLE_WINDOW   = 900;
	const THROTTLE_MAX_HITS = 5;

	/**
	* Minimum length enforced for the new password. Mirrors the strlen<8 guard in
	* login::Login() (component_password has no strength validator of its own).
	*/
	const MIN_PASSWORD_LENGTH = 8;



	/**
	* REQUEST
	* Step 1 of the recovery flow: resolve an identifier (username OR email) to a
	* single active user with a valid email, generate + store a one-time code, and
	* email it. Always returns the same generic response so the caller cannot tell
	* whether an account exists.
	*
	* @param string $identifier - username or email address typed by the user
	* @return object {
	*   result   : true        always (anti-enumeration),
	*   msg      : string       generic confirmation message,
	*   reset_id : string       opaque hex token used by confirm()
	* }
	*/
	public static function request(string $identifier) : object {

		$identifier = trim($identifier);

		// reset_id is generated up-front so the response shape is identical on
		// every path (existing account or not). It only becomes meaningful when a
		// matching entry is actually stored below.
		$reset_id = self::generate_reset_id();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'If an account matches, a recovery code has been sent to its email address.';
			$response->reset_id	= $reset_id;

		// Basic input guard. Too short to be a real username or email → no-op.
		if (strlen($identifier) < 2) {
			self::enumeration_delay();
			return $response;
		}

		// Request throttle (per identifier + trusted IP). When locked we still
		// return the generic OK but skip resolution/sending entirely.
		$throttle_key = self::build_key('pwreset_req', $identifier);
		if (self::is_throttled($throttle_key)) {
			debug_log(__METHOD__." Request throttled for identifier", logger::WARNING);
			// Apply the same constant-time delay as the other no-op paths so a throttled
			// identifier is not observably faster than a normal request (timing oracle).
			self::enumeration_delay();
			return $response;
		}
		self::record_throttle_hit($throttle_key);

		// Resolve the single qualifying user (active + valid email). Any other
		// outcome (none, several, inactive, no email) is treated as a no-op.
		$resolved = self::resolve_single_target($identifier);
		if ($resolved===null) {
			self::enumeration_delay();
			return $response;
		}

		$user_id	= $resolved->user_id;
		$email		= $resolved->email;

		// Generate + store the code (only its hash is persisted).
		$code = self::generate_code();
		if (!self::store_entry($reset_id, $user_id, $code)) {
			// Storage unavailable: behave as a no-op (do not send a code the
			// confirm step could never verify).
			debug_log(__METHOD__." Could not persist reset entry (cache unavailable)", logger::ERROR);
			return $response;
		}

		// Send the email. Failures are logged but never surfaced (anti-enumeration).
		$ttl_minutes	= (int)ceil(self::code_ttl() / 60);
		$mail_options	= new stdClass();
			$mail_options->to			= $email;
			$mail_options->subject		= 'Your Dédalo password recovery code';
			$mail_options->body_text	= self::build_email_body($code, $ttl_minutes);
		$mail_response = dd_mailer::send($mail_options);
		if ($mail_response->result!==true) {
			debug_log(__METHOD__." Mailer failed: ".implode(', ', $mail_response->errors ?? []), logger::ERROR);
		}

		// Never log the code or the email address value.
		debug_log(__METHOD__." Recovery code issued for user_id=".$user_id, logger::WARNING);

		// audit trail (server-side activity log)
		self::audit('PASSWORD RESET', 'Password recovery code requested', [
			'result'	=> 'request',
			'user_id'	=> $user_id
		]);

		return $response;
	}//end request



	/**
	* CONFIRM
	* Step 2 of the recovery flow: verify the code typed by the user against the
	* stored hash and, on success, write the new password.
	*
	* Failure responses are deliberately generic so they do not reveal whether the
	* code was wrong, expired or never existed. The only specific error is
	* 'weak_password', which concerns the user's own input (not account existence)
	* and does NOT consume a verify attempt.
	*
	* @param string $reset_id     - opaque token returned by request()
	* @param string $code         - 8-digit code the user received by email
	* @param string $new_password - the new plaintext password to set
	* @return object { result:bool, msg:string, errors:array }
	*/
	public static function confirm(string $reset_id, string $code, string $new_password) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Invalid or expired code.';
			$response->errors	= ['invalid_or_expired'];

		// Validate the reset_id shape (32 lowercase hex). sha1() is applied before
		// touching the filesystem, but reject malformed tokens early anyway.
		if (!self::is_valid_reset_id($reset_id)) {
			return $response;
		}

		// Verify throttle (per reset_id + trusted IP).
		$throttle_key = self::build_key('pwreset_verify', $reset_id);
		if (self::is_throttled($throttle_key)) {
			$response->msg		= 'Too many attempts. Please request a new code.';
			$response->errors	= ['too_many_attempts'];
			return $response;
		}

		// Load the stored entry. Missing or expired → generic invalid_or_expired.
		$entry = self::load_entry($reset_id);
		if ($entry===null || !isset($entry->expires) || (int)$entry->expires < time()) {
			self::delete_entry($reset_id); // clean up an expired entry if present
			return $response;
		}

		// Validate the new password BEFORE consuming a verify attempt: a weak
		// password is the user's own input problem, not a wrong-code guess.
		if (!self::is_valid_new_password($new_password)) {
			$response->msg		= 'Password too short. Use at least '.self::MIN_PASSWORD_LENGTH.' characters.';
			$response->errors	= ['weak_password'];
			return $response;
		}

		// Constant-time code verification.
		$code		= trim($code);
		$code_hash	= (string)($entry->code_hash ?? '');
		if ($code_hash==='' || !password_verify($code, $code_hash)) {

			// Wrong code: count the attempt against this code and against the IP.
			self::record_throttle_hit($throttle_key);
			$attempts = self::increment_attempts($reset_id);
			if ($attempts >= self::max_verify_attempts()) {
				self::delete_entry($reset_id);
				$response->msg		= 'Too many attempts. Please request a new code.';
				$response->errors	= ['too_many_attempts'];
			}
			return $response;
		}

		// Correct code: write the new password and burn the code.
		$ok = self::reset_user_password((int)$entry->user_id, $new_password);
		self::delete_entry($reset_id);
		self::clear_throttle($throttle_key);

		if ($ok!==true) {
			$response->msg		= 'Could not update the password. Please try again later.';
			$response->errors	= ['reset_failed'];
			return $response;
		}

		$reset_user_id = (int)$entry->user_id;
		debug_log(__METHOD__." Password reset completed for user_id=".$reset_user_id, logger::WARNING);

		// audit trail (server-side activity log)
		self::audit('PASSWORD RESET', 'Password reset completed via recovery', [
			'result'	=> 'success',
			'user_id'	=> $reset_user_id
		]);

		// notify the account owner that their password changed, so an unauthorized
		// reset is noticed. Best-effort: failures are logged but do not affect the result.
		self::send_password_changed_notice($reset_user_id);

		$response->result	= true;
		$response->msg		= 'Your password has been updated. You can now log in.';
		$response->errors	= [];

		return $response;
	}//end confirm



	/**
	* SEND_PASSWORD_CHANGED_NOTICE
	* Email the account owner a "your password was changed" confirmation after a
	* successful recovery. Best-effort: any failure is logged and swallowed.
	*
	* @param int $user_id
	* @return void
	*/
	private static function send_password_changed_notice(int $user_id) : void {

		$email = self::get_user_email($user_id);
		if ($email===null || !component_email::is_valid_email($email)) {
			return;
		}

		$mail_options				= new stdClass();
			$mail_options->to		= $email;
			$mail_options->subject	= 'Your Dédalo password was changed';
			$mail_options->body_text	= self::build_password_changed_body();

		$mail_response = dd_mailer::send($mail_options);
		if ($mail_response->result!==true) {
			debug_log(__METHOD__." Notice email failed: ".implode(', ', $mail_response->errors ?? []), logger::ERROR);
		}
	}//end send_password_changed_notice



	/**
	* AUDIT
	* Record a recovery event in the activity log (server-side audit trail).
	* Wrapped defensively so audit failures never break the recovery flow.
	*
	* @param string $label   - activity action label (e.g. 'PASSWORD RESET')
	* @param string $message - human-readable summary
	* @param array $data     - structured activity data (user_id, result, …)
	* @return void
	*/
	private static function audit(string $label, string $message, array $data=[]) : void {

		try {
			if (function_exists('get_client_ip_trusted')) {
				$data['ip'] = get_client_ip_trusted();
			}
			if (method_exists('login', 'login_activity_report')) {
				login::login_activity_report($message, $label, $data);
			}
		} catch (Throwable $e) {
			debug_log(__METHOD__." Audit log failed: ".$e->getMessage(), logger::WARNING);
		}
	}//end audit



	/**
	* RESOLVE_SINGLE_TARGET
	* Resolve a username-or-email identifier to exactly one active user that has a
	* valid email address. Returns null for zero, multiple, inactive, or
	* email-less matches so the caller can treat them all as an indistinguishable
	* no-op.
	*
	* @param string $identifier
	* @return object|null { user_id:int, email:string }
	*/
	private static function resolve_single_target(string $identifier) : ?object {

		// Collect candidate user ids from both lookups (the identifier may be a
		// username or an email). Exclude non-positive ids (e.g. root = -1): the
		// superuser is never recoverable through this public flow.
		$candidates = [];

		foreach (login::get_users_with_name($identifier) as $id) {
			$id = (int)$id;
			if ($id > 0) { $candidates[$id] = true; }
		}

		$clean_email = component_email::clean_email($identifier);
		if (!empty($clean_email) && component_email::is_valid_email($clean_email)) {
			foreach (self::get_users_with_email($clean_email) as $id) {
				$id = (int)$id;
				if ($id > 0) { $candidates[$id] = true; }
			}
		}

		// Keep only active users that have a valid email on file.
		$qualified = [];
		foreach (array_keys($candidates) as $user_id) {
			if (login::active_account_check($user_id)!==true) {
				continue;
			}
			$email = self::get_user_email($user_id);
			if ($email===null || !component_email::is_valid_email($email)) {
				continue;
			}
			$qualified[] = (object)[
				'user_id'	=> $user_id,
				'email'		=> $email
			];
		}

		// Exactly one qualifying user, or no-op.
		if (count($qualified)!==1) {
			return null;
		}

		return $qualified[0];
	}//end resolve_single_target



	/**
	* GET_USERS_WITH_EMAIL
	* Find user section ids in matrix_users whose component_email (dd134) value
	* equals $email. Mirrors login::get_users_with_code() (AUTH-03 safe: the value
	* is JSON-encoded and bound as a prepared-statement parameter), but returns ALL
	* matches (no LIMIT) so the caller can detect — and refuse — a duplicate-email
	* situation.
	*
	* @param string $email - already cleaned + validated email address
	* @return array - list of matching section_id integers (possibly empty)
	*/
	private static function get_users_with_email(string $email) : array {

		$email_component_tipo = DEDALO_USER_EMAIL_TIPO; // dd134

		$params = [
			json_encode([$email_component_tipo => [['lang' => 'lg-nolan', 'value' => $email]]], JSON_UNESCAPED_UNICODE)
		];

		$sql  = 'SELECT section_id' . PHP_EOL;
		$sql .= 'FROM matrix_users' . PHP_EOL;
		$sql .= 'WHERE section_tipo = \'' . DEDALO_SECTION_USERS_TIPO .'\'' . PHP_EOL;
		$sql .= 'AND matrix_users.string::jsonb @> $1' . PHP_EOL;
		$sql .= 'ORDER BY section_id ASC';

		$result = matrix_db_manager::exec_search($sql, $params);
		if (!$result) {
			return [];
		}

		$ar_section_id = [];
		while ($row = pg_fetch_assoc($result)) {
			$ar_section_id[] = (int)$row['section_id'];
		}

		return $ar_section_id;
	}//end get_users_with_email



	/**
	* GET_USER_EMAIL
	* Read the email address stored on a user record (component_email, dd134).
	*
	* @param int $user_id
	* @return string|null - the email value, or null when absent/empty
	*/
	private static function get_user_email(int $user_id) : ?string {

		$component = component_common::get_instance(
			'component_email',
			DEDALO_USER_EMAIL_TIPO,
			$user_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO,
			false
		);
		$data = $component->get_data();
		if (empty($data) || !isset($data[0]->value)) {
			return null;
		}
		$email = trim((string)$data[0]->value);

		return $email!=='' ? $email : null;
	}//end get_user_email



	/**
	* RESET_USER_PASSWORD
	* Write a new password to the user record. component_password::set_data()
	* hashes the plaintext with Argon2id; this is the exact pattern used by the
	* SEC-001 lazy-upgrade path in login::Login().
	*
	* @param int $user_id
	* @param string $plaintext
	* @return bool - true on success
	*/
	private static function reset_user_password(int $user_id, string $plaintext) : bool {

		// component_common::Save() records the modifying user (dd197 modified_by_user)
		// via logged_user_id(), which reads $_SESSION. This recovery flow is
		// unauthenticated, so logged_user_id() is null and section_record::
		// build_modification_data() throws a TypeError. Temporarily attribute the
		// modification to the user themselves (they are resetting their own password)
		// for the duration of the Save, then restore the prior session state.
		$had_dedalo	= isset($_SESSION['dedalo']) && is_array($_SESSION['dedalo']);
		$had_auth	= $had_dedalo && isset($_SESSION['dedalo']['auth']) && is_array($_SESSION['dedalo']['auth']);
		$had_user	= $had_auth && array_key_exists('user_id', $_SESSION['dedalo']['auth']);
		$prev_user	= $had_user ? $_SESSION['dedalo']['auth']['user_id'] : null;

		if (!$had_dedalo) {
			$_SESSION['dedalo'] = [];
		}
		if (!isset($_SESSION['dedalo']['auth']) || !is_array($_SESSION['dedalo']['auth'])) {
			$_SESSION['dedalo']['auth'] = [];
		}
		$_SESSION['dedalo']['auth']['user_id'] = $user_id;

		$ok = false;
		try {
			$component = component_common::get_instance(
				'component_password',
				DEDALO_USER_PASSWORD_TIPO,
				$user_id,
				'edit',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO,
				false
			);
			if ($component instanceof component_password) {
				$component->set_data([(object)['value' => $plaintext]]);
				$component->Save();
				$ok = true;
			}
		} catch (Throwable $e) {
			debug_log(__METHOD__." Failed to save new password for user_id=".$user_id.": ".$e->getMessage(), logger::ERROR);
			$ok = false;
		} finally {
			// restore the prior session state exactly as it was
			if (!$had_dedalo) {
				unset($_SESSION['dedalo']);
			} elseif (!$had_auth) {
				unset($_SESSION['dedalo']['auth']);
			} elseif (!$had_user) {
				unset($_SESSION['dedalo']['auth']['user_id']);
			} else {
				$_SESSION['dedalo']['auth']['user_id'] = $prev_user;
			}
		}

		return $ok;
	}//end reset_user_password



	/**
	* IS_VALID_NEW_PASSWORD
	* Minimum length gate for the new password (mirrors login::Login()).
	*
	* @param string $password
	* @return bool
	*/
	private static function is_valid_new_password(string $password) : bool {

		return strlen($password) >= self::MIN_PASSWORD_LENGTH;
	}//end is_valid_new_password



	/**
	* GENERATE_CODE
	* Cryptographically secure 8-digit numeric code, zero-padded.
	*
	* @return string e.g. '00428715'
	*/
	private static function generate_code() : string {

		return str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
	}//end generate_code



	/**
	* GENERATE_RESET_ID
	* Opaque, non-secret correlation token used as the file-store key.
	*
	* @return string - 32 lowercase hex characters
	*/
	private static function generate_reset_id() : string {

		return bin2hex(random_bytes(16));
	}//end generate_reset_id



	/**
	* IS_VALID_RESET_ID
	* @param string $reset_id
	* @return bool - true for exactly 32 lowercase hex characters
	*/
	private static function is_valid_reset_id(string $reset_id) : bool {

		return strlen($reset_id)===32 && ctype_xdigit($reset_id) && strtolower($reset_id)===$reset_id;
	}//end is_valid_reset_id



	/**
	* BUILD_EMAIL_BODY
	* Plain-text recovery email body. Kept minimal and free of any account
	* identifier so a misdirected email leaks nothing.
	*
	* @param string $code
	* @param int $ttl_minutes
	* @return string
	*/
	private static function build_email_body(string $code, int $ttl_minutes) : string {

		return "Someone requested a password recovery for your Dédalo account.\n\n"
			. "Your recovery code is: ".$code."\n\n"
			. "This code expires in ".$ttl_minutes." minutes and can only be used once.\n\n"
			. "If you did not request this, you can safely ignore this email; your password will not change.";
	}//end build_email_body



	/**
	* BUILD_PASSWORD_CHANGED_BODY
	* Plain-text "your password was changed" notice sent after a successful reset.
	* Free of any account identifier so a misdirected email leaks nothing.
	*
	* @return string
	*/
	private static function build_password_changed_body() : string {

		return "The password for your Dédalo account was just changed using the password recovery process.\n\n"
			. "If this was you, no further action is needed.\n\n"
			. "If you did NOT change your password, contact your Dédalo administrator immediately — someone may have access to your email account.";
	}//end build_password_changed_body



	// ======================================================================
	// FILE STORE (mirrors login throttle helpers; subdir dd_password_reset/)
	// ======================================================================



	/**
	* GET_STORE_FILE
	* Absolute path to the per-reset_id JSON entry file, or null when the cache
	* infrastructure is unavailable. The reset_id is sha1-digested so the filename
	* is a safe fixed-length hex string (no path traversal). Mirrors
	* login::get_login_throttle_file().
	*
	* @param string $reset_id
	* @return string|null
	*/
	private static function get_store_file(string $reset_id) : ?string {

		$base_path = self::cache_base_path();
		if ($base_path===null || !is_dir($base_path)) {
			return null;
		}
		$dir = rtrim($base_path, '/') . '/dd_password_reset';
		if (!is_dir($dir)) {
			@mkdir($dir, 0700, true);
		}
		if (!is_dir($dir) || !is_writable($dir)) {
			return null;
		}

		return $dir . '/' . sha1($reset_id) . '.json';
	}//end get_store_file



	/**
	* STORE_ENTRY
	* Persist { user_id, code_hash, expires, attempts:0 } for a reset_id. Only the
	* password_hash() of the code is stored — never the plaintext code.
	*
	* @param string $reset_id
	* @param int $user_id
	* @param string $code
	* @return bool - true when the entry was written
	*/
	private static function store_entry(string $reset_id, int $user_id, string $code) : bool {

		$file = self::get_store_file($reset_id);
		if ($file===null) {
			return false;
		}

		$payload = json_encode([
			'user_id'	=> $user_id,
			'code_hash'	=> password_hash($code, PASSWORD_ARGON2ID),
			'expires'	=> time() + self::code_ttl(),
			'attempts'	=> 0
		], JSON_UNESCAPED_SLASHES);

		$fp = @fopen($file, 'c+');
		if ($fp===false) {
			return false;
		}
		$ok = false;
		try {
			if (@flock($fp, LOCK_EX)) {
				ftruncate($fp, 0);
				rewind($fp);
				fwrite($fp, $payload);
				fflush($fp);
				flock($fp, LOCK_UN);
				$ok = true;
			}
		} finally {
			fclose($fp);
		}

		return $ok;
	}//end store_entry



	/**
	* LOAD_ENTRY
	* Read and decode the stored entry for a reset_id.
	*
	* @param string $reset_id
	* @return object|null - { user_id, code_hash, expires, attempts } or null
	*/
	private static function load_entry(string $reset_id) : ?object {

		$file = self::get_store_file($reset_id);
		if ($file===null || !file_exists($file)) {
			return null;
		}
		$raw = @file_get_contents($file);
		if ($raw===false || $raw==='') {
			return null;
		}
		$decoded = json_decode($raw);

		return ($decoded instanceof stdClass) ? $decoded : null;
	}//end load_entry



	/**
	* INCREMENT_ATTEMPTS
	* Atomically bump the wrong-guess counter on the stored entry and return the
	* new value. Returns the max cap when the entry cannot be read/written so the
	* caller treats it as exhausted.
	*
	* @param string $reset_id
	* @return int - new attempts count
	*/
	private static function increment_attempts(string $reset_id) : int {

		$file = self::get_store_file($reset_id);
		if ($file===null) {
			return self::max_verify_attempts();
		}
		$fp = @fopen($file, 'c+');
		if ($fp===false) {
			return self::max_verify_attempts();
		}
		$attempts = self::max_verify_attempts();
		try {
			if (@flock($fp, LOCK_EX)) {
				$raw	= stream_get_contents($fp);
				$state	= $raw ? json_decode($raw, true) : null;
				if (is_array($state)) {
					$attempts = (int)($state['attempts'] ?? 0) + 1;
					$state['attempts'] = $attempts;
					$payload = json_encode($state, JSON_UNESCAPED_SLASHES);
					ftruncate($fp, 0);
					rewind($fp);
					fwrite($fp, $payload);
					fflush($fp);
				}
				flock($fp, LOCK_UN);
			}
		} finally {
			fclose($fp);
		}

		return $attempts;
	}//end increment_attempts



	/**
	* DELETE_ENTRY
	* Remove the stored entry (on success, expiry, or attempt-cap). Mirrors
	* login::clear_failed_login_attempts().
	*
	* @param string $reset_id
	* @return void
	*/
	private static function delete_entry(string $reset_id) : void {

		$file = self::get_store_file($reset_id);
		if ($file!==null && file_exists($file)) {
			@unlink($file);
		}
	}//end delete_entry



	// ======================================================================
	// THROTTLE (reuses the login file-store pattern; subdir dd_pwreset_throttle/)
	// ======================================================================



	/**
	* BUILD_KEY
	* Composite throttle key "<namespace>|<lower(identifier)>|<trusted_ip>".
	* Mirrors login::build_login_throttle_key().
	*
	* @param string $namespace
	* @param string $identifier
	* @return string
	*/
	private static function build_key(string $namespace, string $identifier) : string {

		$ip = function_exists('get_client_ip_trusted') ? get_client_ip_trusted() : '';
		return $namespace . '|' . strtolower($identifier) . '|' . $ip;
	}//end build_key



	/**
	* GET_THROTTLE_FILE
	* Path to the per-key throttle JSON file under dd_pwreset_throttle/, or null.
	*
	* @param string $key
	* @return string|null
	*/
	private static function get_throttle_file(string $key) : ?string {

		$base_path = self::cache_base_path();
		if ($base_path===null || !is_dir($base_path)) {
			return null;
		}
		$dir = rtrim($base_path, '/') . '/dd_pwreset_throttle';
		if (!is_dir($dir)) {
			@mkdir($dir, 0700, true);
		}
		if (!is_dir($dir) || !is_writable($dir)) {
			return null;
		}

		return $dir . '/' . sha1($key) . '.json';
	}//end get_throttle_file



	/**
	* IS_THROTTLED
	* True when the key has reached THROTTLE_MAX_HITS within THROTTLE_WINDOW.
	* Skipped during unit tests (IS_UNIT_TEST) to avoid cross-test state leakage,
	* matching login::check_login_throttle().
	*
	* @param string $key
	* @return bool
	*/
	private static function is_throttled(string $key) : bool {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) {
			return false;
		}
		$file = self::get_throttle_file($key);
		if ($file===null || !file_exists($file)) {
			return false;
		}
		$raw	= @file_get_contents($file);
		$state	= $raw ? json_decode($raw, true) : null;
		if (!is_array($state) || !isset($state['attempts']) || !is_array($state['attempts'])) {
			return false;
		}
		$now	= time();
		$hits	= array_filter($state['attempts'], static fn($ts) => is_numeric($ts) && ((int)$ts > ($now - self::THROTTLE_WINDOW)));

		return count($hits) >= self::THROTTLE_MAX_HITS;
	}//end is_throttled



	/**
	* RECORD_THROTTLE_HIT
	* Append the current timestamp to the key's throttle file (pruning old
	* entries). No-op during unit tests.
	*
	* @param string $key
	* @return void
	*/
	private static function record_throttle_hit(string $key) : void {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) {
			return;
		}
		$file = self::get_throttle_file($key);
		if ($file===null) {
			return;
		}
		$now = time();
		$fp = @fopen($file, 'c+');
		if ($fp===false) {
			return;
		}
		try {
			if (@flock($fp, LOCK_EX)) {
				$raw		= stream_get_contents($fp);
				$state		= $raw ? json_decode($raw, true) : null;
				$attempts	= (is_array($state) && isset($state['attempts']) && is_array($state['attempts']))
					? $state['attempts']
					: [];
				$attempts = array_values(array_filter($attempts, static fn($ts) => is_numeric($ts) && ((int)$ts > ($now - self::THROTTLE_WINDOW))));
				$attempts[] = $now;
				$payload = json_encode(['attempts' => $attempts, 'last_seen' => $now], JSON_UNESCAPED_SLASHES);
				ftruncate($fp, 0);
				rewind($fp);
				fwrite($fp, $payload);
				fflush($fp);
				flock($fp, LOCK_UN);
			}
		} finally {
			fclose($fp);
		}
	}//end record_throttle_hit



	/**
	* CLEAR_THROTTLE
	* Delete the throttle file for a key (after a successful reset).
	*
	* @param string $key
	* @return void
	*/
	private static function clear_throttle(string $key) : void {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) {
			return;
		}
		$file = self::get_throttle_file($key);
		if ($file!==null && file_exists($file)) {
			@unlink($file);
		}
	}//end clear_throttle



	// ======================================================================
	// HELPERS
	// ======================================================================



	/**
	* CACHE_BASE_PATH
	* Resolve the cache files base path the same way login does.
	*
	* @return string|null
	*/
	private static function cache_base_path() : ?string {

		if (defined('DEDALO_CACHE_PATH')) {
			return DEDALO_CACHE_PATH;
		}
		if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {
			return DEDALO_CACHE_MANAGER['files_path'];
		}

		return null;
	}//end cache_base_path



	/**
	* CODE_TTL
	* @return int - configured code TTL in seconds (config override or default)
	*/
	private static function code_ttl() : int {

		return defined('DEDALO_PWRESET_CODE_TTL') ? (int)DEDALO_PWRESET_CODE_TTL : self::CODE_TTL_SECONDS;
	}//end code_ttl



	/**
	* MAX_VERIFY_ATTEMPTS
	* @return int - configured per-code attempt cap (config override or default)
	*/
	private static function max_verify_attempts() : int {

		return defined('DEDALO_PWRESET_MAX_ATTEMPTS') ? (int)DEDALO_PWRESET_MAX_ATTEMPTS : self::MAX_VERIFY_ATTEMPTS;
	}//end max_verify_attempts



	/**
	* ENUMERATION_DELAY
	* Apply the same ~2s delay login::Login() uses on failed paths so the response
	* time of a no-match request is indistinguishable from a real one. Skipped on
	* development servers and during unit tests.
	*
	* @return void
	*/
	private static function enumeration_delay() : void {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true) {
			return;
		}
		if (defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
			return;
		}
		sleep(2);
	}//end enumeration_delay



}//end class password_reset
