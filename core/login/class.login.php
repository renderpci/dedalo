<?php declare(strict_types=1);
/**
* CLASS LOGIN
* Handles user authentication, session management, and login security for Dédalo.
*
* This class is the single entry-point for all credential-based access to Dédalo.
* Responsibilities:
* - Standard username/password authentication with Argon2id verification and
*   transparent legacy AES → Argon2id rehash on first successful login (SEC-001).
* - SAML authentication for institutional identity providers (Login_SAML).
* - Session fixation prevention via session ID regeneration on login and logout
*   (SEC-004 / SEC-080).
* - Brute-force / credential-stuffing throttle keyed by (namespace|username|ip),
*   stored as per-key JSON files under DEDALO_CACHE_MANAGER['files_path'] (SEC-019).
* - Maintenance-mode access control: only the root user (username 'root') may log in
*   while DEDALO_MAINTENANCE_MODE is true.
* - Media access control: issues the daily-rotated auth cookie and syncs the
*   server-side marker files through media_protection on every login.
* - Login/logout activity reporting through the activity logger.
* - Post-login sequence: backup, DB ANALYZE, cache warming, component-lock cleanup.
*
* Extends common for structure-context loading (ontology, mode, lang).
* Extended by nothing (final behaviour through static calls).
*
* @package Dédalo
* @subpackage Core
*/
class login extends common {



	/**
	* CLASS VARS
	*/
		/**
		* Numeric record identifier for this login instance. Always null for login operations
		* because the login form is not associated with any particular section record.
		* @var ?int $id
		*/
		protected ?int $id = null;

		/**
		* Ontology tipo for the "active account" component (component_radio_button, value dd131).
		* Used by active_account_check() to fetch account activation state from matrix_users.
		* The stored value is compared to the NUMERICAL_MATRIX_VALUE_YES constant.
		* @var string $tipo_active_account
		*/
		protected string $tipo_active_account = 'dd131';

		/**
		* Ontology tipo for the login submit button (dd259).
		* Used by get_structure_context() to include the button in the login form context so
		* the client can render the button from the ontology definition.
		* @var string $tipo_button_login
		*/
		protected string $tipo_button_login = 'dd259';

		/**
		* The expected default password value for the root (super-user) account.
		* An empty string signals "no default password configured"; check_root_has_default_password()
		* flags the installer when the stored password is blank, matching this sentinel.
		* (!) Never store a non-empty value here — this constant is intentionally empty.
		*/
		const SU_DEFAULT_PASSWORD = '';



	/**
	* __CONSTRUCT
	* Initialize a login instance bound to the fixed login section tipo (dd229).
	*
	* Sets up the common inherited state (id, tipo, lang, mode) and calls
	* parent::load_structure_data() to populate the ontology structure.
	* The is_logged() guard is intentionally skipped here so that the login form
	* context (get_structure_context) can be fetched even before a session exists —
	* this also allows unit tests to build a login instance without a live session.
	*
	* @param string $mode = 'edit' - Operation mode passed to the parent constructor.
	* @return void
	*/
	public function __construct(string $mode='edit') {

		// (!) removed is_logged verification because it's necessary to get the context of login
		// in test environments like unit_test

		$id		= null;
		$tipo	= self::get_login_tipo();

		$this->set_id($id);
		$this->set_tipo($tipo);
		$this->set_lang(DEDALO_DATA_LANG);
		$this->set_mode($mode);

		// boolean $result
		parent::load_structure_data();
	}//end __construct



	/**
	* SEC-019: brute-force / credential-stuffing throttling.
	*
	* Failed login attempts are persisted to a small JSON file under
	* DEDALO_CACHE_MANAGER['files_path']. The state is keyed by a sha1 of
	* (username|ip) so an attacker cannot lock another user out from a
	* completely different IP. Tunables (with safe defaults):
	*
	*   DEDALO_LOGIN_MAX_ATTEMPTS   (int,  default 10)  - failures before lockout
	*   DEDALO_LOGIN_ATTEMPT_WINDOW (int,  default 900) - sliding window seconds
	*   DEDALO_LOGIN_LOCKOUT_SECONDS(int,  default 900) - cooldown after lockout
	*/

	/**
	* GET_LOGIN_THROTTLE_FILE
	* Returns the absolute filesystem path to the per-key throttle state JSON file,
	* or null when the cache infrastructure is not available (constant missing, directory
	* absent, or not writable). Files are stored under
	*   DEDALO_CACHE_MANAGER['files_path']/dd_login_attempts/<sha1(key)>.json
	* The SHA-1 digest of the raw key prevents directory traversal and limits
	* the filename to a safe fixed-length hex string.
	* @param string $key - throttle key produced by build_login_throttle_key()
	* @return string|null - absolute path, or null when unavailable
	*/
	private static function get_login_throttle_file(string $key) : ?string {

		// AUTH-08 (known limitation): throttle state is local-disk only, so lockout
		// is per-node. Under a multi-node deployment behind a load balancer (or a
		// shared KV/redis session backend), an attacker's attempts spread across nodes
		// and the per-node counters never reach the lockout threshold. The single-node
		// file backend is correct for single-node installs (the common case). Proper
		// multi-node remediation: when a shared backend is configured, persist these
		// counters there with atomic increments + TTL and keep this file path as the
		// single-node fallback. Tracked as a deliberate follow-up (needs the shared
		// backend wiring), not a code change here.
		if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
			return null;
		}
		$base_path = DEDALO_CACHE_MANAGER['files_path'];
		if (!is_dir($base_path)) {
			return null;
		}
		$dir = rtrim($base_path, '/') . '/dd_login_attempts';
		if (!is_dir($dir)) {
			@mkdir($dir, 0700, true);
		}
		if (!is_dir($dir) || !is_writable($dir)) {
			return null;
		}
		return $dir . '/' . sha1($key) . '.json';
	}//end get_login_throttle_file



	/**
	* CHECK_LOGIN_THROTTLE
	* Evaluate whether the given (namespace|username|ip) key is currently locked out.
	*
	* Reads the per-key JSON state file and applies the sliding-window rule:
	*  - Count only timestamps within the last DEDALO_LOGIN_ATTEMPT_WINDOW seconds.
	*  - If the count is below DEDALO_LOGIN_MAX_ATTEMPTS, allow the attempt (return null).
	*  - If the latest attempt + DEDALO_LOGIN_LOCKOUT_SECONDS is still in the future,
	*    return a pre-built response object so the caller can short-circuit immediately.
	*  - Once the lockout window has passed, the caller is allowed again (return null).
	* Skipped entirely during unit-test runs (IS_UNIT_TEST === true) to prevent
	* state leaking between test cases.
	*
	* Tunable constants (all have safe built-in defaults):
	*   DEDALO_LOGIN_MAX_ATTEMPTS    (default 10)  — failures before lockout.
	*   DEDALO_LOGIN_ATTEMPT_WINDOW  (default 900) — sliding window in seconds.
	*   DEDALO_LOGIN_LOCKOUT_SECONDS (default 900) — cooldown after reaching the limit.
	*
	* @param string $key - throttle key produced by build_login_throttle_key()
	* @return object|null - null means proceed; a stdClass with result/msg/errors/retry_after means reject
	*/
	private static function check_login_throttle(string $key) : ?object {

		// Skip during unit tests to avoid leaking state across runs.
		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST === true) {
			return null;
		}

		$file = self::get_login_throttle_file($key);
		if ($file === null || !file_exists($file)) {
			return null;
		}

		$max     = defined('DEDALO_LOGIN_MAX_ATTEMPTS')    ? (int)DEDALO_LOGIN_MAX_ATTEMPTS    : 10;
		$lockout = defined('DEDALO_LOGIN_LOCKOUT_SECONDS') ? (int)DEDALO_LOGIN_LOCKOUT_SECONDS : 900;
		$window  = defined('DEDALO_LOGIN_ATTEMPT_WINDOW')  ? (int)DEDALO_LOGIN_ATTEMPT_WINDOW  : 900;

		$raw     = @file_get_contents($file);
		$state   = $raw ? json_decode($raw, true) : null;
		if (!is_array($state) || !isset($state['attempts']) || !is_array($state['attempts'])) {
			return null;
		}

		$now = time();
		// Drop attempts older than the window.
		$attempts = array_values(array_filter(
			$state['attempts'],
			static fn($ts) => is_numeric($ts) && ((int)$ts > ($now - $window))
		));

		if (count($attempts) < $max) {
			return null;
		}

		// Locked: latest attempt + lockout still in the future.
		$latest = (int)max($attempts);
		if (($latest + $lockout) <= $now) {
			return null;
		}

		$retry_after = max(1, ($latest + $lockout) - $now);
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Too many failed login attempts. Please retry in ' . $retry_after . ' seconds.';
			$response->errors	= ['login_locked'];
			$response->retry_after = $retry_after;
		return $response;
	}//end check_login_throttle



	/**
	* RECORD_FAILED_LOGIN_ATTEMPT
	* Append the current Unix timestamp to the throttle state file for the given key.
	*
	* The file is opened with 'c+' (create-or-append without truncation) and an
	* exclusive flock() ensures that concurrent PHP workers do not corrupt the JSON.
	* Old entries beyond DEDALO_LOGIN_ATTEMPT_WINDOW are pruned on every write so the
	* file does not grow unboundedly. No-op during unit tests.
	*
	* @param string $key - throttle key produced by build_login_throttle_key()
	* @return void
	*/
	private static function record_failed_login_attempt(string $key) : void {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST === true) {
			return;
		}

		$file = self::get_login_throttle_file($key);
		if ($file === null) {
			return;
		}

		$window = defined('DEDALO_LOGIN_ATTEMPT_WINDOW') ? (int)DEDALO_LOGIN_ATTEMPT_WINDOW : 900;
		$now    = time();

		$fp = @fopen($file, 'c+');
		if ($fp === false) {
			return;
		}
		try {
			if (@flock($fp, LOCK_EX)) {
				$raw   = stream_get_contents($fp);
				$state = $raw ? json_decode($raw, true) : null;
				$attempts = (is_array($state) && isset($state['attempts']) && is_array($state['attempts']))
					? $state['attempts']
					: [];
				// Prune older entries and append the new one.
				$attempts = array_values(array_filter(
					$attempts,
					static fn($ts) => is_numeric($ts) && ((int)$ts > ($now - $window))
				));
				$attempts[] = $now;
				$payload = json_encode([
					'attempts'   => $attempts,
					'last_seen'  => $now
				], JSON_UNESCAPED_SLASHES);
				ftruncate($fp, 0);
				rewind($fp);
				fwrite($fp, $payload);
				fflush($fp);
				flock($fp, LOCK_UN);
			}
		} finally {
			fclose($fp);
		}
	}//end record_failed_login_attempt



	/**
	* CLEAR_FAILED_LOGIN_ATTEMPTS
	* Delete the throttle state file for the given key after a successful authentication.
	*
	* Resetting on success means a legitimate user who hits a transient lockout due to
	* a forgotten password can log in normally once they use the correct credentials,
	* without waiting for the full lockout window to expire.
	* No-op during unit tests.
	*
	* @param string $key - throttle key produced by build_login_throttle_key()
	* @return void
	*/
	private static function clear_failed_login_attempts(string $key) : void {

		if (defined('IS_UNIT_TEST') && IS_UNIT_TEST === true) {
			return;
		}
		$file = self::get_login_throttle_file($key);
		if ($file !== null && file_exists($file)) {
			@unlink($file);
		}
	}//end clear_failed_login_attempts



	/**
	* BUILD_LOGIN_THROTTLE_KEY
	* Build a composite throttle key from a namespace, a case-normalised identifier,
	* and the trusted client IP address.
	*
	* Format: "<namespace>|<lower(identifier)>|<trusted_ip>"
	* This compound key means:
	*  - Different namespaces ('login' vs 'saml') maintain independent counters.
	*  - Username comparison is case-insensitive (prevents trivial bypass via mixed case).
	*  - Keying by IP prevents an attacker from locking out all users by guessing many
	*    names from the same address, while each IP still accumulates its own counter.
	*  - get_client_ip_trusted() is used (not $_SERVER['REMOTE_ADDR'] directly) so that
	*    reverse-proxy X-Forwarded-For headers are handled safely.
	*
	* @param string $namespace  - caller context label, e.g. 'login' or 'saml'
	* @param string $identifier - username, SAML code, or other user-identifying token
	* @return string
	*/
	private static function build_login_throttle_key(string $namespace, string $identifier) : string {

		$ip = function_exists('get_client_ip_trusted') ? get_client_ip_trusted() : '';
		return $namespace . '|' . strtolower($identifier) . '|' . $ip;
	}//end build_login_throttle_key



	/**
	* LOGIN
	* Execute user login action by validating credentials against database
	*
	* Performs comprehensive validation including:
	* - Username and password format validation
	* - Maintenance mode access control
	* - Database user existence and uniqueness checks
	* - Password encryption and verification
	* - Account status validation
	* - User profile and project permissions
	* - Login session initialization
	*
	* @param object $options Login credentials object
	* {
	* 	username: string User login name
	* 	password: string User password (min 8 characters)
	* }
	* @see Mandatory vars: 'username','password'
	*
	* @return object $response Login result with status and messages
	* {
	* 	result: bool Login success status
	* 	msg: string Status message
	* 	errors: array Error messages array
	* 	result_options: object Additional response data
	* 	default_section: string User's default section tipo
	* }
	*
	* @throws Exception When database operations fail
	*/
	public static function Login( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed [Login]';
			$response->errors	= [];

		// options
			$username = $options->username;
			$password = $options->password;

		// username
			if(!empty($username) && is_string($username)) {
				$username = trim($username);
			}
			if (!is_string($username) || empty($username)) {
				$response->msg = "Error Processing Request: username is invalid!";
				$response->errors[] = 'Invalid user name';
				return $response;
			}

			$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
				? DEDALO_MAINTENANCE_MODE_CUSTOM
				: DEDALO_MAINTENANCE_MODE;
			if($maintenance_mode===true && $username!=='root'){
				$response->msg = label::get_label('site_under_maintenance') ?? 'System under maintenance';
				$response->errors[] = 'System under maintenance';
				return $response;
			}
			// safe username
			$username = safe_xss($username);

		// password
			if (!is_string($password) || empty($password) || strlen($password)<8) {
				$response->msg = "Error Processing Request: password is empty or the length is invalid !";
				$response->errors[] = 'Invalid password length';
				return $response;
			}

		// SEC-019: brute-force throttle. Refuse the attempt entirely if this
		// (username, IP) tuple is currently locked out. The check happens after
		// the cheap input-format validations above so malformed payloads do not
		// inflate the failure counter.
			$throttle_key  = self::build_login_throttle_key('login', $username);
			$throttle_lock = self::check_login_throttle($throttle_key);
			if ($throttle_lock !== null) {
				return $throttle_lock;
			}

		// search username
			$ar_section_id	= login::get_users_with_name( $username );
			$ar_result		= $ar_section_id;
			$user_count		= count($ar_result);

			// v6 root fallback (provisional migration helper)
			// The root superuser (section_id -1) does not have a real row in matrix_users,
			// so get_users_with_name() returns an empty array for 'root'. Fall back to the
			// synthetic [-1] result so the credential path continues normally.
			// (!) PROVISIONAL: remove once all deployments have migrated past v7.0.0.
			if( empty($ar_result) && $username==='root' ){
				$ar_result = login::get_v6_root_db_data();
				$user_count = count($ar_result);
			}

		// user found in db check
			if( !is_array($ar_result) || empty($ar_result[0]) ) {

				#
				# STOP: USERNAME DO NOT EXISTS
				#
				$activity_data['result'] = 'deny';
				$activity_data['cause'] = 'User does not exist';
				$activity_data['username'] = $username;

				# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
				self::login_activity_report(
					"Denied login attempted by: $username. This user does not exist in the database",
					'LOG IN',
					$activity_data
				);
				// SEC-019: record this failed attempt against the (username, IP) key.
				self::record_failed_login_attempt($throttle_key);
				// delay failed output after 2 seconds to prevent brute force attacks
				if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				// response
				$response->msg = "Error: User does not exists or password is invalid!";
				$response->errors[] = 'User does not exists or password is invalid';
				// error_log("DEDALO LOGIN ERROR : Invalid user or password");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// user ambiguous check (more than one with same name case)
			if( $user_count>1 ) {

				#
				# STOP: USERNAME DUPLICATED
				#
				$activity_data['result'] = 'deny';
				$activity_data['cause'] = 'User duplicated in database';
				$activity_data['username'] = $username;

				# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
				self::login_activity_report(
					"Denied login attempted by : $username. This user exist more than once in the database ".$user_count,
					'LOG IN',
					$activity_data
				);
				// SEC-019: ambiguous user is a server-side problem, not a credential
				// guess; do not feed the brute-force counter here.
				# delay failed output after 2 seconds to prevent brute force attacks
				if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				$response->msg = 'Error: User ambiguous';
				$response->errors[] = 'More than one user with the same name already exists';
				// error_log("DEDALO LOGIN ERROR : Invalid user or password. User ambiguous ($username)");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// password check
			$user_id = $section_id = (int)reset($ar_result);

			# Search password
			$component_password	= component_common::get_instance(
				'component_password',
				DEDALO_USER_PASSWORD_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO,
				false
			);
			$ar_password_data	= $component_password->get_data() ?? [];
			$password_data		= $ar_password_data[0]->value ?? null;

			// give password of v6
			if( empty($password_data) && $username==='root' ){
				$password_data = $component_password->get_v6_root_password_data();
			}

			// password length check
				if( empty($password_data) || strlen($password_data)<8 ) {
					// SEC-019: treat empty/short stored password as a failed credential check.
					self::record_failed_login_attempt($throttle_key);
					$response->msg = 'Error: Wrong password [2]';
					$response->errors[] = 'Wrong password [2]';
					// error_log("DEDALO LOGIN ERROR : Wrong password [2] (".DEDALO_ENTITY.")");
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' username: ' . $username . PHP_EOL
						. ' DEDALO_ENTITY: ' . DEDALO_ENTITY
						, logger::WARNING
					);
					return $response;
				}

			// password match check
			// SEC-001/002/007: verify_password() handles both the modern Argon2id
			// hash and the legacy reversible AES blob. When a legacy match succeeds
			// we rehash the password with Argon2id and persist it - the user keeps
			// their existing password, the storage upgrades silently in place.
				[$password_ok, $password_needs_rehash] = component_password::verify_password($password, $password_data);
				if (!$password_ok) {

					#
					# STOP : PASSWORD IS WRONG
					#
					$activity_data['result']	= 'deny';
					$activity_data['cause']	= 'wrong password';
					$activity_data['username']	= $username;

					# LOGIN ACTIVITY REPORT
					self::login_activity_report(
						"Denied login attempted by: $username. Wrong password [1] (Incorrect password)",
						'LOG IN',
						$activity_data
					);
					// SEC-019: a wrong password is the canonical brute-force signal.
					self::record_failed_login_attempt($throttle_key);
					# delay failed output by 2 seconds to prevent brute force attacks
					if (DEVELOPMENT_SERVER!==true) {
						sleep(2);
					}
					$response->msg = 'Error: Wrong password [1]';
					$response->errors[] = 'Wrong password [1]';
					// error_log("DEDALO LOGIN ERROR : Wrong password [1] (".DEDALO_ENTITY.")");
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' username: ' . $username . PHP_EOL
						. ' DEDALO_ENTITY: ' . DEDALO_ENTITY
						, logger::WARNING
					);
					return $response;
				}//end if (!$password_ok)

			// SEC-001 lazy upgrade: if the stored value is the legacy AES blob (or
			// an outdated parameter set) rehash with Argon2id and persist. Best-effort
			// only; we never block a successful login on a storage upgrade failure.
				if ($password_needs_rehash === true && $username !== 'root') {
					try {
						$upgrade_component = component_common::get_instance(
							'component_password',
							DEDALO_USER_PASSWORD_TIPO,
							$section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							DEDALO_SECTION_USERS_TIPO,
							false
						);
						if ($upgrade_component instanceof component_password) {
							$upgrade_component->set_data([(object)[ 'value' => $password ]]);
							$upgrade_component->Save();
							debug_log(__METHOD__
								. ' SEC-001 lazy upgrade: rehashed password for user_id=' . $section_id
								, logger::WARNING
							);
						}
					} catch (Throwable $e) {
						debug_log(__METHOD__
							. ' SEC-001 lazy upgrade FAILED for user_id=' . $section_id . ': ' . $e->getMessage()
							, logger::ERROR
						);
					}
				}

		// active account check
			$active_account = login::active_account_check( $section_id );
			if( $active_account!==true ) {

				#
				# STOP : ACCOUNT INACTIVE
				#

				# LOGIN ACTIVITY REPORT
				self::login_activity_report(
					"Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
					'LOG IN',
					// activity_data
					array(
						'result' 	=> 'deny',
						'cause' 	=> 'account inactive',
						'username' 	=> $username
					)
				);

				# delay failed output by 2 seconds to prevent brute force attacks
				if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				$response->msg = 'Error: Account inactive or not defined [1]';
				$response->errors[] = 'Account inactive or not defined';
				// error_log("DEDALO LOGIN ERROR : Account inactive");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// profile / projects check
			$is_global_admin = security::is_global_admin($user_id);
			if($is_global_admin!==true) {

				#
				# PROFILE
					$user_have_profile = login::user_have_profile_check($user_id);
					if ($user_have_profile!==true) {
						$response->msg = label::get_label('user_without_profile_error');
						$response->errors[] = 'User without profile';
						return $response;
					}

				#
				# PROJECTS : TEST FILTER MASTER VALUES
					$user_have_projects = login::user_have_projects_check($user_id);
					if ($user_have_projects!==true) {
						$response->msg = label::get_label('user_without_projects_error');
						$response->errors[] = 'User without projects';
						return $response;
					}

			}//end if(!security::is_global_admin($user_id))


		// SEC-019: credentials are confirmed valid (password matched, account active,
		// profile/projects checks passed); reset the throttle counter for this key so
		// a long-running attacker pattern does not penalise the legitimate user.
			self::clear_failed_login_attempts($throttle_key);

		// Login (all is ok) - init login sequence when all is ok
			$full_username				= login::get_full_username($user_id);
			$init_user_login_sequence	= login::init_user_login_sequence(
				$user_id,
				$username,
				$full_username
			);
			if ($init_user_login_sequence->result===false) {

				// return false
				$response->result			= false;
				$response->msg				= $init_user_login_sequence->msg;
				$response->errors			= isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
				$response->result_options	= $init_user_login_sequence->result_options;

			}else if($init_user_login_sequence->result===true) {

				// return OK and reload page
				$response->result			= true;
				$response->msg				= " Login.. ";
				$response->errors			= isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
				$response->result_options	= $init_user_login_sequence->result_options;
				$response->default_section	= login::get_default_section($user_id);
			}


		return $response;
	}//end Login



	/**
	* LOGIN_SAML
	* Execute SAML-based authentication using external identity provider
	*
	* Performs SAML authentication including:
	* - Client IP validation against allowed IdP IPs
	* - User code lookup and validation
	* - Account status verification
	* - User profile and project permissions check
	* - Session initialization for SAML users
	*
	* @param object $options SAML authentication data
	* {
	* 	code: string User identifier from SAML provider (DNI, etc.)
	* }
	*
	* @return object $response Authentication result
	* {
	* 	result: bool Authentication success status
	* 	msg: string Status message
	* 	errors: array Error messages array
	* }
	*
	* @throws Exception When SAML configuration is invalid or database operations fail
	*/
	public static function Login_SAML(object $options) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__.' Error. Request failed';
			$response->errors	= [];

		// options
			$code = isset($options->code)
				? (is_array($options->code) ? $options->code[0] : $options->code)
				: null;

		// IP validation
		// SEC-017: use the trusted IP resolver so that an attacker cannot satisfy
		// the SAML idp_ip allowlist by injecting a forged X-Forwarded-For header.
		// Strict comparison prevents loose-typing surprises if SAML_CONFIG['idp_ip']
		// happens to contain non-string entries.
			if (defined('SAML_CONFIG') && !empty(SAML_CONFIG['idp_ip'])) {
				$client_ip = get_client_ip_trusted();
				if ($client_ip === '' || !in_array($client_ip, SAML_CONFIG['idp_ip'], true)) {
					$response->msg = "[Login_SAML] Error. Invalid client IP !";
					$response->errors[] = 'Invalid IP';
					return $response;
				}
			}

		// SEC-019: brute-force throttle for the SAML code path. Keyed by SAML
		// code + trusted client IP so that an attacker poking arbitrary codes
		// from one IP gets locked out without affecting other users.
			$throttle_key  = self::build_login_throttle_key('saml', is_string($code) ? $code : '');
			$throttle_lock = self::check_login_throttle($throttle_key);
			if ($throttle_lock !== null) {
				return $throttle_lock;
			}

		# Search code (DNI, etc.)
			$ar_section_id	= login::get_users_with_code( $code );
			$ar_result		= $ar_section_id;

			$section_id = !empty($ar_result[0]) ? $ar_result[0] : false;
			if($section_id!==false) {

				// OK

					$section_id = (int)$ar_result[0];
					$username 	= 'saml_user';

					// Is already logged check
						if (login::is_logged()===true) {
							if (logged_user_id()==$section_id) {
								# Logged as same user
								$response->result = true;
								$response->msg 	  = " User already logged. ";
								return $response;
							}else{
								# Logged as different user
								login::Quit((object)[
									'mode'	=> 'saml',
									'cause'	=> 'Browser already logged as different user'
								]); // Logout old user before continue login
							}
						}

					// Active account check
						$active_account = login::active_account_check($section_id);
						if( $active_account!==true ) {

							#
							# STOP : ACCOUNT INACTIVE
							#

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"[Login_SAML] Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
								'LOG IN',
								// activity_data
								array(
									'result' 	=> 'deny',
									'cause' 	=> 'account inactive',
									'username' 	=> $username
								)
							);

							// SEC-019: inactive account on a valid SAML code is not a credential
							// guess; do not feed the brute-force counter here.
							# delay failed output by 2 seconds to prevent brute force attacks
							if (DEVELOPMENT_SERVER!==true) {
								sleep(2);
							}
							$response->msg = "[Login_SAML] Error: Account inactive or not defined [1]";
							error_log("[Login_SAML] DEDALO LOGIN ERROR : Account inactive");
							return $response;
						}

					// Is global admin
						$is_global_admin = security::is_global_admin($section_id);

					// Profile / projects check
						if($is_global_admin!==true) {

							#
							# PROFILE
								$user_have_profile = login::user_have_profile_check($section_id);
								if ($user_have_profile!==true) {
									$response->msg = label::get_label('error_usuario_sin_perfil');
									return $response;
								}

							#
							# PROJECTS : TEST FILTER MASTER VALUES
								$user_have_projects = login::user_have_projects_check($section_id);
								if ($user_have_projects!==true) {
									$response->msg = label::get_label('user_without_projects_error');
									return $response;
								}

						}//end if(!security::is_global_admin($section_id))

					// SEC-019: SAML code resolved to an active, authorised account; clear
					// the throttle counter for this code+IP key.
						self::clear_failed_login_attempts($throttle_key);

					// LOGIN (ALL IS OK) - INIT LOGIN SEQUENCE WHEN ALL IS OK

						// User name
							$username = login::logged_user_username($section_id);

						// Full username
							$full_username = login::get_full_username($section_id);

						// init_user_login_sequence
							$init_user_login_sequence = login::init_user_login_sequence(
								$section_id,
								$username,
								$full_username,
								false, // bool init_test
								'saml'
							);
							if ($init_user_login_sequence->result===false) {
								# RETURN FALSE
								$response->result = false;
								$response->msg 	  = $init_user_login_sequence->msg;
								$response->errors = isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
							}else if($init_user_login_sequence->result===true) {
								# RETURN OK AND RELOAD PAGE
								$response->result = true;
								$response->msg 	  = " Login.. ";
								$response->errors = isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
							}
			}else{

				// Error
					#
					# STOP: CODE DOES NOT EXISTS
					#

					// LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
						self::login_activity_report(
							"[Login_SAML] Denied login attempted by: saml_user. This code does not exist in the database",
							'LOG IN',
							// activity_data
							array(
								'result' 	=> 'deny',
								'cause' 	=> 'code not exist',
								'username' 	=> 'from saml',
								'code' 		=> $code
							)
						);

					// SEC-019: an unknown SAML code is the canonical brute-force signal
					// for this path; record it.
					self::record_failed_login_attempt($throttle_key);
					# delay failed output after 2 seconds to prevent brute force attacks
					if (DEVELOPMENT_SERVER!==true) {
						sleep(2);
					}
					$response->msg = label::get_label('user_code_does_not_exist_error'); # "Error: User Code not exists! Please try again";
					error_log("[Login_SAML] DEDALO LOGIN ERROR : Invalid saml code");
					return $response;
			}


		return $response;
	}//end Login_SAML



	/**
	* LOGGED_USER_USERNAME
	* Return the login name (username) stored for the given user section_id.
	*
	* Fetches the DEDALO_USER_NAME_TIPO component (component_input_text) in nolan lang
	* and joins all value entries with a space. In practice usernames are single-valued,
	* but the join handles the edge case where multiple data entries exist gracefully.
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return string - concatenated username value(s), or an empty string if none stored
	*/
	public static function logged_user_username( string|int $section_id ) : string {

		$component = component_common::get_instance(
			'component_input_text',
			DEDALO_USER_NAME_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$data = $component->get_data_lang() ?? [];

		// Extract values
		$values = array_map(function($item) {
			return $item->value;
		}, $data);

		$username = implode(' ', $values);

		return $username;
	}//end get_username



	/**
	* GET_FULL_USERNAME
	* Return the human-readable display name stored for the given user section_id.
	*
	* Fetches the DEDALO_FULL_USER_NAME_TIPO component (component_input_text) in nolan lang
	* and joins all value entries with a space. The full username is written into the session
	* ($_SESSION['dedalo']['auth']['full_username']) during init_user_login_sequence() and is
	* used in activity-log messages and the UI greeting.
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return string - concatenated full name value(s), or an empty string if none stored
	*/
	public static function get_full_username( string|int $section_id ) : string {

		$component = component_common::get_instance(
			'component_input_text',
			DEDALO_FULL_USER_NAME_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$data = $component->get_data_lang() ?? [];

		// Extract values
		$values = array_map(function($item) {
			return $item->value;
		}, $data);

		$full_username = implode(' ', $values);

		return $full_username;
	}//end get_full_username



	/**
	* GET_USER_CODE
	* Return the external identifier code (e.g. DNI, passport) stored for the given user.
	*
	* Reads ontology tipo dd1053 (component_input_text for user codes) and joins all values
	* with a space. This code is the same token that SAML identity providers send back and that
	* get_users_with_code() queries to match an incoming SAML assertion to a Dédalo user record.
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return ?string - concatenated code value(s); the declared return type is ?string
	*                   but the method can return '' (empty string) when no data is stored
	*/
	public static function get_user_code( string|int $section_id ) : ?string {

		$tipo = 'dd1053'; // Code input text
		$model = ontology_node::get_model_by_tipo($tipo,true);
		$component = component_common::get_instance(
			$model,
			$tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$data = $component->get_data_lang() ?? [];

		// Extract values
		$values = array_map(function($item) {
			return $item->value;
		}, $data);

		$code = implode(' ', $values);

		return $code;
	}//end get_user_code



	/**
	* GET_USER_IMAGE
	* Return the relative web URL for the avatar image stored for the given user.
	*
	* Reads the DEDALO_USER_IMAGE_TIPO (dd522) component_image and calls get_url() with the
	* default image quality. The URL is relative (absolute = false) and the existence of the
	* underlying file is verified (test_file = true) so broken image links are not returned.
	*
	* Fallback: when the section_id is less than 1 (e.g. the virtual root user with id -1) and
	* no image is stored, returns the path to the default theme thumbnail raspa_screen.jpg.
	*
	* Example URL: /v6/media/media_development/image/1.5MB/dd522_dd128_1.jpg
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return string|null - relative image URL, or null when no image is stored and section_id >= 1
	*/
	public static function get_user_image( string|int$section_id ) : ?string {

		$component = component_common::get_instance(
			'component_image',
			DEDALO_USER_IMAGE_TIPO, // 'dd522'
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$user_image = $component->get_url(
			DEDALO_IMAGE_QUALITY_DEFAULT,
			true, // test_file
			false, // absolute
			false // default_add
		);

		if(empty($user_image) && $section_id<1) {
			$user_image = DEDALO_ROOT_WEB . '/core/themes/default/raspas/raspa_screen.jpg';
		}


		return $user_image;
	}//end get_user_image



	/**
	* ACTIVE_ACCOUNT_CHECK
	* Verify if user account is active and allowed to login
	*
	* Checks the DEDALO_ACTIVE_ACCOUNT_TIPO component for the user's
	* account status. Returns true only if the account is explicitly
	* marked as active (value equals NUMERICAL_MATRIX_VALUE_YES).
	*
	* Special case: root user (-1) is always considered active
	*
	* @param string|int $section_id User section identifier
	* @return bool True if account is active, false otherwise
	*/
	public static function active_account_check( string|int $section_id ) : bool {

		$active_account = false; // Default false

		// root case
		if( (int)$section_id===-1 ){
			return true;
		}

		$model = ontology_node::get_model_by_tipo( DEDALO_ACTIVE_ACCOUNT_TIPO, true );
		$component_radio_button	= component_common::get_instance(
			$model,
			DEDALO_ACTIVE_ACCOUNT_TIPO,
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$active_account_data = $component_radio_button->get_data();

		// Empty or null data, the user has not defined if the account is active or not, therefore is not active.
		if( empty($active_account_data) ){
			return $active_account; // false
		}

		// Resolve the selected radio-button value
		// component_radio_button stores data items as objects with a 'section_id' property
		// that holds the section_id of the chosen list entry, not the user's section_id.
		// The valid 'active' choice maps to NUMERICAL_MATRIX_VALUE_YES (= 1, 'Yes' in the
		// referenced lookup list). Any other value (e.g. 2 = 'No') leaves $active_account false.
		// (!) $section_id here shadows the method parameter; it refers to the selected
		//     list-entry section_id, not the user section_id passed in.
		$section_id = $active_account_data[0]->section_id ?? null;
		if ( $section_id && (int)$section_id === NUMERICAL_MATRIX_VALUE_YES ) {
			$active_account = true;
		}

		return $active_account;
	}//end active_account_check



	/**
	* USER_HAVE_PROFILE_CHECK
	* Return true if the given user has a security profile assigned.
	*
	* Delegates to security::get_user_profile() which reads the profile component
	* for the user record. A user without a profile cannot determine which sections
	* and components they are allowed to access, so login is denied.
	* Global admins bypass this check (see Login() / Login_SAML()).
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return bool - true when a profile locator exists, false otherwise
	*/
	public static function user_have_profile_check( string|int $section_id ) : bool {

		$locator		= security::get_user_profile($section_id);
		$have_profile	= !empty($locator)
			? true
			: false;

		return (bool)$have_profile;
	}//end user_have_profile_check



	/**
	* USER_HAVE_PROJECTS_CHECK
	* Return true if the given user has at least one project (filter_master entry) assigned.
	*
	* Reads the DEDALO_FILTER_MASTER_TIPO (component_filter_master) component for the user
	* record. The filter_master drives the per-request projects filter that scopes every
	* data query to the user's allowed collections. A user with no projects assigned would
	* see an empty dataset, so login is denied.
	* Global admins bypass this check (see Login() / Login_SAML()).
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return bool - true when at least one filter_master datum exists, false otherwise
	*/
	public static function user_have_projects_check( string|int $section_id ) : bool {

		$user_have_projects = false; // Default false

		$component_filter_master = component_common::get_instance(
			'component_filter_master',
			DEDALO_FILTER_MASTER_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_LANG,
			DEDALO_SECTION_USERS_TIPO
		);
		$filter_master_data = $component_filter_master->get_data() ?? [];
		if (!empty($filter_master_data) && count($filter_master_data)>0) {
			$user_have_projects = true;
		}

		return $user_have_projects;
	}//end user_have_projects_check



	/**
	* GET_DEFAULT_SECTION
	* Return the tipo of the section that should be shown immediately after login for the given user.
	*
	* Reads ontology tipo dd1603 (component_input_text for the default-section preference)
	* from the user record. The client redirects to this area after a successful login so
	* each user can land on their preferred starting screen.
	* Special case: the root user (section_id == -1) always lands on DEDALO_AREA_MAINTENANCE_TIPO
	* because regular areas are not appropriate for the superuser account.
	*
	* @param string|int $section_id - user section ID (record in DEDALO_SECTION_USERS_TIPO)
	* @return ?string - section tipo string, or null when no preference is stored
	*/
	private static function get_default_section( string|int $section_id ) : ?string {

		// root user case
			if ($section_id==-1) {
				return DEDALO_AREA_MAINTENANCE_TIPO;
			}

		$component = component_common::get_instance(
			'component_input_text',
			'dd1603',
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$data = $component->get_data();

		$default_section = $data[0]->value ?? null;

		return $default_section;
	}//end get_default_section



	/**
	* INIT_USER_LOGIN_SEQUENCE
	* Execute all post-authentication setup steps after credentials have been verified.
	*
	* Called by Login() and Login_SAML() once every security gate has passed.
	* Performs in order:
	*  1. Optional dd_init_test (system health check): errors are accumulated in
	*     $response->errors but do NOT abort the login — the UI displays warnings.
	*  2. Session ID regeneration (SEC-004) to prevent session fixation.
	*  3. Writes all auth session variables (user_id, username, full_username,
	*     is_logged=1, salt_secure, login_type, is_global_admin, is_developer).
	*     salt_secure uses dedalo_encrypt_v2 (AES-256-GCM) since SEC-082.
	*  4. Media access control cookie initialisation (init_cookie_auth) if the
	*     media_protection mode is active.
	*  5. On-login backup (if DEDALO_BACKUP_ON_LOGIN is true).
	*  6. Daily DB ANALYZE trigger in a background process (if not recently run).
	*  7. Component lock cleanup: releases any locks the user left from a previous session.
	*  8. Background security-access datalist cache generation.
	*  9. Sets the dedalo_logged JS-readable cookie (SEC-013: Secure/SameSite=Lax).
	* 10. Writes the activity log entry.
	*
	* (!) This method writes directly to $_SESSION. It must run before any output is flushed.
	*
	* @param int $user_id         - authenticated user's section_id in DEDALO_SECTION_USERS_TIPO
	* @param string $username     - login name (written to session and activity log)
	* @param string $full_username - display name (written to session)
	* @param bool $init_test = true    - run dd_init_test system health check
	* @param string $login_type = 'default' - authentication channel ('default' or 'saml')
	* @return object - stdClass with result (bool), msg (string), errors (array),
	*                  result_options (object|null with user_image, user_id, optional redirect)
	*/
	private static function init_user_login_sequence(int $user_id, string $username, string $full_username, bool $init_test=true, string $login_type='default') : object {

		$response = new stdClass();
			$response->result			= false;
			$response->msg				= 'Error on init_user_login_sequence';
			$response->errors			= [];
			$response->result_options	= null;

		// ob_implicit_flush(true);

		// dedalo init test sequence
			if ($init_test===true) {

				// dd_init_test
					$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';

				// errors found on init test (Don't stop execution here)
					if ($init_response->result===false) {
						debug_log(__METHOD__
							." Init test error (dd_init_test): ". PHP_EOL
							.' init_response: ' . $init_response->msg
							, logger::ERROR
						);
						// Don't stop here. Only inform user of init error via JavaScript
							# $response->result 	= false;
							# $response->msg 		= $init_response->msg;
							# return $response;
						array_push($response->errors, ...$init_response->msg);
					}

				// init_response result_options (like redirect)
					if (isset($init_response->result_options)) {
						$response->result_options = $init_response->result_options;
					}
			}

		// SEC-004: regenerate session ID on successful authentication to prevent session fixation.
		// Must run BEFORE writing any auth-related data to $_SESSION so the previous (anonymous /
		// possibly attacker-planted) session id cannot be replayed.
			if (session_status() === PHP_SESSION_ACTIVE) {
				try {
					session_regenerate_id(true);
				} catch (\Throwable $e) {
					debug_log(__METHOD__
						. ' session_regenerate_id failed: ' . $e->getMessage()
						, logger::WARNING
					);
				}
			}

		// is_global_admin (before set user session vars)
			$is_global_admin = (bool)security::is_global_admin($user_id);
			$_SESSION['dedalo']['auth']['is_global_admin'] = $is_global_admin;

		// is_developer (before set user session vars)
			$is_developer = (bool)security::is_developer($user_id);
			$_SESSION['dedalo']['auth']['is_developer'] = $is_developer;

		// session : If backup is OK, fix session data
			$_SESSION['dedalo']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo']['auth']['username']			= $username;
			$_SESSION['dedalo']['auth']['full_username']	= $full_username;
			$_SESSION['dedalo']['auth']['is_logged']		= 1;

		// config key
			// SEC-082: switched from legacy AES-CBC (`dedalo_encrypt_openssl`) to
			// authenticated AES-256-GCM (`dedalo_encrypt_v2`). The salt_secure
			// session marker is only ever checked for non-emptiness (see
			// `is_logged()` below), never decrypted, so flipping the algorithm
			// is safe and does not require a migration on existing sessions.
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_v2(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo']['auth']['login_type'] = $login_type;

		// fix lang
			if (!isset($_SESSION['dedalo']['config']['dedalo_application_lang'])) {
				$_SESSION['dedalo']['config']['dedalo_application_lang'] = DEDALO_APPLICATION_LANG;
			}

		// cookie authorization (media access control: 'private' or 'publication' mode)
			if (media_protection::get_mode()!==false) {
				self::init_cookie_auth();
			}

		// backup all
			if( DEDALO_BACKUP_ON_LOGIN ) {

				$make_backup_response = backup::init_backup_sequence((object)[
					'user_id'					=> $user_id,
					'username'					=> $username,
					'skip_backup_time_range'	=> false
				]);
				$backup_info = $make_backup_response->msg;
				if (!empty($make_backup_response->errors)) {
					$response->errors = array_merge($response->errors, $make_backup_response->errors);
				}

			}else{
				$backup_info = 'Deactivated "on login backup" for this domain';
			}

		// db analyze daily
			if (!defined('DEDALO_DB_ANALYZE_ON_LOGIN')) {
				define('DEDALO_DB_ANALYZE_ON_LOGIN', true);
			}
			if (DEDALO_DB_ANALYZE_ON_LOGIN===true && defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {

				try {

					if (db_tasks::should_run_analyze()===true) {

						$cache_file_name = db_tasks::get_analyze_cache_file_name();
						debug_log(__METHOD__
							." Executing DB ANALYZE in background... [cache_file_name: $cache_file_name]"
							, logger::DEBUG
						);
						dd_cache::process_and_cache_to_file((object)[
							'process_file'	=> DEDALO_CORE_PATH . '/db/db_analyze_process.php',
							'data'			=> (object)[
								'session_id'	=> session_id(),
								'user_id'		=> $user_id
							],
							'file_name'		=> $cache_file_name,
							'prefix'		=> '',
							'wait'			=> false
						]);

					}else{
						debug_log(__METHOD__
							." Skipped DB ANALYZE. Recently executed (less than 24 hours ago)"
							, logger::DEBUG
						);
					}

				} catch (Exception $e) {
					debug_log(__METHOD__." Error on DB ANALYZE process: $e ", logger::ERROR);
				}
			}

		// remove lock_components elements
			try {
				# remove lock_components elements
				if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
					lock_components::force_unlock_all_components($user_id);
				}
				# GET ENTITY DIFFUSION TABLES / SECTIONS . Store for speed
				# $entity_diffusion_tables = diffusion::get_entity_diffusion_tables(DEDALO_DIFFUSION_DOMAIN);
				# $_SESSION['dedalo']['config']['entity_diffusion_tables'] = $entity_diffusion_tables;

			} catch (Exception $e) {
				debug_log(__METHOD__." $e ", logger::CRITICAL);
			}

		// precalculate profiles datalist security access in background
		// This file is generated on every user login, launching the process in background
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {

				try {
					// delete previous cache files (prevents reuse of old files when the user does not quit from the browser)
					dd_cache::delete_cache_files();

					$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);
					debug_log(__METHOD__
						." Generating security access datalist in background... [cache_file_name: $cache_file_name]"
						, logger::DEBUG
					);
					dd_cache::process_and_cache_to_file((object)[
						'process_file'	=> DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
						'data'			=> (object)[
							'session_id'	=> session_id(),
							'user_id'		=> $user_id,
							'lang'			=> DEDALO_APPLICATION_LANG
						],
						'file_name'		=> $cache_file_name,
						'wait'			=> false
					]);

					// cache ontology
					// @TODO Working progress
					// ontology::build_cache_file();
					// register_shutdown_function(['ontology','build_cache_file']);

				} catch (Exception $e) {
					debug_log(__METHOD__." $e ", logger::CRITICAL);
				}
			}

		// user image
			$user_image = login::get_user_image($user_id);
			if (!isset($response->result_options)) {
				$response->result_options = new stdClass();
			}
			$response->result_options->user_image	= $user_image;
			$response->result_options->user_id		= $user_id;

		// add cookie dedalo_logged (used to check some features in same domain web)
		// SEC-013: add Secure/SameSite flags. HttpOnly is intentionally false because
		// the same-domain web reads this signal from JavaScript.
			$dedalo_logged_secure = (defined('DEDALO_PROTOCOL') && DEDALO_PROTOCOL === 'https://');
			setcookie('dedalo_logged', 'true', [
				'expires'  => time() + 86400,
				'path'     => '/',
				'secure'   => $dedalo_logged_secure,
				'httponly' => false,
				'samesite' => 'Lax'
			]);

		// log : Prepare and save login action
			$browser = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
			if (strpos($browser, 'AppleWebKit')===false) $browser = '<i style="color:red">'.$browser.'</i>';

			$activity_data['result']	= 'allow';
			$activity_data['cause']		= 'correct user and password';
			$activity_data['username']	= $username;
			$activity_data['browser']	= $browser;
			$activity_data['DB-backup']	= $backup_info;

			// login activity report
			self::login_activity_report(
				"User $user_id is logged. Hello $username",
				'LOG IN',
				$activity_data
			);

		// OK response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK init_user_login_sequence is done'
				: 'Warning! init_user_login_sequence is done with some errors';


		return $response;
	}//end init_user_login_sequence



	/**
	* INIT_COOKIE_AUTH
	* Set up the server-side media access control markers and issue the auth cookie.
	*
	* Implements media access control rule A (work / private mode):
	*  - Reads the persisted cookie-auth state file (media_protection::read_cookie_auth_file).
	*  - If today's AND yesterday's values already exist in the file, the data is recycled
	*    (no new values generated — a login by a second user on the same day reuses them).
	*  - Otherwise generates new daily cookie values for today and, if absent, yesterday,
	*    then writes the state file via media_protection::write_cookie_auth_file().
	*    The file includes a '<?php exit();' guard so its contents cannot be disclosed via HTTP.
	*  - Calls media_protection::sync_auth_markers() to create/remove the stat()-able marker
	*    files that the web server (Apache/Nginx) checks against the cookie value.
	*  - Calls media_protection::write_htaccess() (config-hash guarded, normally a no-op)
	*    to regenerate .htaccess when the media protection configuration has changed.
	*  - Stores the cookie data in $_SESSION['dedalo']['auth']['cookie_auth'] for reuse by
	*    Quit() when clearing the cookie on logout.
	*  - Issues the auth cookie using the domain/secure/httponly properties from
	*    get_cookie_properties() so it matches the security posture of the session cookie.
	*
	* (!) Throws an Exception (not just logs) on write failures: a misconfigured media
	*     protection setup must fail loudly at login time rather than silently allow access
	*     to protected files.
	*
	* @return bool - always true on success; throws on fatal media protection errors
	* @throws Exception - when writing the cookie auth file, syncing markers, or regenerating
	*                     .htaccess fails
	*/
	private static function init_cookie_auth() : bool {

		// short vars
			$ktoday			= date("Y_m_d");
			$kyesterday		= date("Y_m_d",strtotime("-1 day"));
			$cookie_file	= media_protection::get_cookie_auth_file_path();
			// SEC: the file carries a '<?php exit();' first line so the raw
			// JSON can never be disclosed if fetched over HTTP
			// (read_cookie_auth_file strips it; legacy raw-JSON files OK)
			$ar_data		= media_protection::read_cookie_auth_file();

		if ( isset($ar_data->$ktoday->cookie_value) && isset($ar_data->$kyesterday->cookie_value) ) {

			$data = $ar_data;
			debug_log(__METHOD__." data 1 Recycle ".to_string($data), logger::DEBUG);

		}else{

			$data = new stdClass();

			$ktoday_data = new stdClass();
				$ktoday_data->cookie_name	= media_protection::COOKIE_NAME;
				$ktoday_data->cookie_value	= self::get_auth_cookie_value();

			$data->$ktoday = $ktoday_data;

			if (isset($ar_data->$kyesterday->cookie_value)) {
				$data->$kyesterday = $ar_data->$kyesterday;
			}else{

				$kyesterday_data = new stdClass();
					$kyesterday_data->cookie_name	= media_protection::COOKIE_NAME;
					$kyesterday_data->cookie_value	= self::get_auth_cookie_value();

				$data->$kyesterday = $kyesterday_data;
			}
			// File cookie data (with the HTTP-disclosure guard line; the
			// parent dir is created when missing — fresh installs)
			if( !media_protection::write_cookie_auth_file($data) ){
				throw new Exception("Error Processing Request. Media protection error on create cookie_file", 1);
			}

			debug_log(__METHOD__." data 2 New data ".to_string($data), logger::DEBUG);
		}

		// auth markers: today + yesterday values become stat-able marker
		// files; stale values are rotated out. Runs on every login (a
		// redeploy or a cleared media dir must self-heal).
			if( !media_protection::sync_auth_markers([
					$data->{$ktoday}->cookie_value,
					$data->{$kyesterday}->cookie_value
				]) ){
				throw new Exception("Error Processing Request. Media protection error on sync auth markers", 1);
			}

		// .htaccess (config-hash guarded, normally a no-op)
			if( !media_protection::write_htaccess() ){
				// Remove cookie file (cookie_file.php)
				unlink($cookie_file);
				// Launch Exception
				throw new Exception("Error Processing Request. Media protection error on create access file", 1);
			}

		$_SESSION['dedalo']['auth']['cookie_auth'] = $data;

		// set cookie
			$cookie_properties = get_cookie_properties();
			$cookie_values = (object)[
				'name'		=> media_protection::COOKIE_NAME,
				'value'		=> $data->{$ktoday}->cookie_value,
				'expires'	=> (time() + (86400 * 1)),
				'path'		=> '/',
				'domain'	=> $cookie_properties->domain ?? '',
				'secure'	=> $cookie_properties->secure,
				'httponly'	=> $cookie_properties->httponly
			];
			setcookie(
				$cookie_values->name,		// string $name
				$cookie_values->value,		// string $value = ""
				$cookie_values->expires,	// int $expires = 0
				$cookie_values->path,		// string $path = ""
				$cookie_values->domain,		// string $domain = ""
				$cookie_values->secure,		// bool $secure = false
				$cookie_values->httponly	// bool $httponly = false
			);

		return true;
	}//end init_cookie_auth



	/**
	* GET_AUTH_COOKIE_VALUE
	* Generate a cryptographically random daily-scoped cookie value for media access control.
	*
	* Combines date components (weekday, year-day, month-day, month name) from getdate()
	* with 8 random bytes from random_bytes() and hashes the concatenation with SHA-512.
	* The date component means values naturally cycle every 24 hours (calendar-day boundary),
	* while the random suffix prevents value prediction even when the date is known.
	* The SHA-512 hex digest (128 chars) is the value stored in the auth marker files and
	* sent as the browser cookie; the web server validates by stat()-ing the marker file
	* whose name matches the submitted cookie value.
	*
	* (!) The commented-out md5 predecessor was replaced with SHA-512 + random_bytes for
	*     collision resistance and unpredictability — do not revert to md5 + mt_rand.
	*
	* @return string - 128-character lowercase hex SHA-512 digest
	*/
	private static function get_auth_cookie_value() : string {
		$date = getdate();
		#$cookie_value = md5( 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. mt_rand() );
		$cookie_value = hash('sha512', 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. random_bytes(8) );

		return $cookie_value;
	}//end get_auth_cookie_value



	/**
	* IS_LOGGED
	* Return true when the current request has an authenticated Dédalo session.
	*
	* Public facade for verify_login(). All code outside this class should call
	* is_logged() rather than accessing $_SESSION directly, so the session structure
	* is not scattered across the codebase.
	*
	* @see login::verify_login()
	* @return bool - true when the session passes all authentication checks
	*/
	public static function is_logged() : bool {

		return self::verify_login();
	}//end is_logged



	/**
	* VERIFY_LOGIN
	* Validate the current session against the three required authentication markers.
	*
	* A session is considered authenticated when all of the following are true:
	*  1. $_SESSION['dedalo']['auth']['user_id']    is non-empty
	*  2. $_SESSION['dedalo']['auth']['is_logged']  equals integer 1 (strict comparison)
	*  3. $_SESSION['dedalo']['auth']['salt_secure'] is non-empty (set by dedalo_encrypt_v2
	*     in init_user_login_sequence; its presence confirms the session was written by
	*     a genuine Dédalo auth flow, not forged by direct session manipulation)
	*
	* When the user_id is missing (never logged in or session expired) the entire
	* $_SESSION['dedalo'] key is cleared, preserving only the language preferences
	* (application_lang / data_lang) so the UI does not lose the user's locale after
	* a session timeout.
	*
	* Additional gate: if the system is in maintenance mode (DEDALO_MAINTENANCE_MODE or
	* DEDALO_MAINTENANCE_MODE_CUSTOM is true), only the 'root' username is allowed to
	* pass; all other authenticated sessions are treated as unauthenticated.
	*
	* @return bool - true when all gates pass, false otherwise
	*/
	private static function verify_login() : bool {

		if( empty($_SESSION['dedalo']['auth']['user_id']) ||
			empty($_SESSION['dedalo']['auth']['is_logged']) ||
			$_SESSION['dedalo']['auth']['is_logged'] !== 1 ||
			empty($_SESSION['dedalo']['auth']['salt_secure'])
			) {

			// not authenticated case

			if (empty($_SESSION['dedalo']['auth']['user_id'])) {

				// Preserve language preferences across session expiry
				// The lang preferences (application and data lang) live under the 'config'
				// sub-key, not 'auth', so they survive the session wipe below.
				// This ensures the UI reopens in the user's chosen locale after a timeout.
				$dedalo_application_lang	= $_SESSION['dedalo']['config']['dedalo_application_lang'] ?? false;
				$dedalo_data_lang			= $_SESSION['dedalo']['config']['dedalo_data_lang'] ?? false;

				// Wipe the entire dedalo session namespace
				// Avoids leaving partial auth state that could be exploited by a subsequent
				// user reusing the same PHP session slot.
				unset($_SESSION['dedalo']);

				// Restore preserved lang preferences
				if ($dedalo_application_lang) {
					$_SESSION['dedalo']['config']['dedalo_application_lang'] = $dedalo_application_lang;
				}
				if ( $dedalo_data_lang) {
					$_SESSION['dedalo']['config']['dedalo_data_lang'] = $dedalo_data_lang;
				}
			}

			return false;

		}else{

			// authenticated case

			// maintenance mode. Only root user is allowed in maintenance mode
				$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
					? DEDALO_MAINTENANCE_MODE_CUSTOM
					: DEDALO_MAINTENANCE_MODE;
				if($maintenance_mode===true && $_SESSION['dedalo']['auth']['username']!=='root') {
					return false;
				}

			return true;
		}
	}//end verify_login



	/**
	* GET_LOGIN_TIPO
	* Return the fixed ontology tipo that identifies the login section (dd229).
	*
	* This value never changes (it is hard-wired in the ontology) and is used
	* as the tipo argument when building the login context object and when writing
	* activity-log entries so they are scoped to the correct ontology node.
	*
	* @return string - always 'dd229'
	*/
	private static function get_login_tipo() : string {

		$tipo = 'dd229'; // fixed because never changes

		return $tipo;
	}//end get_login_tipo



	/**
	* QUIT
	* Perform user logout and session cleanup
	*
	* Comprehensive logout process including:
	* - Component lock cleanup
	* - User activity statistics update
	* - Cache file deletion
	* - Login activity logging
	* - Cookie cleanup (including media protection cookies)
	* - Session destruction
	* - SAML logout handling (if configured)
	*
	* @param object $options Logout options
	* {
	* 	mode: string Logout mode (optional)
	* 	cause: string Logout reason (default: 'called quit method')
	* }
	*
	* @return bool True if logout completed successfully
	*
	* @throws Exception When session cleanup fails
	*/
	public static function Quit(object $options) : bool {

		// options
			$mode	= $options->mode ?? null;
			$cause	= $options->cause ?? 'called quit method';

		// already login check
			if (self::is_logged()!==true) {
				$user_id = isset($_SESSION['dedalo'])
					? $_SESSION['dedalo']['auth']['user_id']
					: null;
				debug_log(__METHOD__
					. " User is already logged " . PHP_EOL
					. ' user_id: '. $user_id
					, logger::WARNING
				);
				return false;
			}

		// session user values
			$user_id	= logged_user_id();
			$username	= logged_user_username();

		// lock_components. remove lock_components elements
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

		// user activity update stats
			// register_shutdown_function('diffusion_section_stats::update_user_activity_stats', (int)$user_id);
			// (!) Do not use register_shutdown_function here because section->update_modified_section_data
			// needs $_SESSION['dedalo']['auth']['user_id'] as value and is not available after Quit
			diffusion_section_stats::update_user_activity_stats( (int)$user_id );

		// delete previous cache files (prevents reuse of old files when the user does not quit from the browser)
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {
				dd_cache::delete_cache_files();
			}

		// login activity report
			self::login_activity_report(
				"User $user_id was logout. Bye $username",
				'LOG OUT',
				// $activity_data
				array(
					'result'	=> 'quit',
					'cause'		=> $cause,
					'username'	=> $username,
					'mode'		=> $mode
				)
			);

		// Cookie properties
			$cookie_properties = get_cookie_properties();

		// Delete authorization cookie (media access control, fixed name)
			if (media_protection::get_mode()!==false) {
				setcookie(
					media_protection::COOKIE_NAME, // string $name
					'', // string $value
					-1, // int $expires_or_options
					'/', // string $path
					$cookie_properties->domain, // string $domain
					$cookie_properties->secure, // bool $secure
					$cookie_properties->httponly // bool $httponly
				);
			}

		// reset cookie and session
			#unset($_SESSION['dedalo']['auth']);
			#unset($_SESSION['dedalo']['config']);
			$cookie_name = session_name();
			setcookie(
				$cookie_name,
				'',
				-1,
				'/',
				$cookie_properties->domain,
				$cookie_properties->secure,
				$cookie_properties->httponly
			);

		// remove cookie dedalo_logged (used to check some features in same domain web)
		// SEC-013: keep flag parity with the set path so the browser actually overwrites the value.
			$dedalo_logged_secure = (defined('DEDALO_PROTOCOL') && DEDALO_PROTOCOL === 'https://');
			setcookie('dedalo_logged', 'false', [
				'expires'  => 1,
				'path'     => '/',
				'secure'   => $dedalo_logged_secure,
				'httponly' => false,
				'samesite' => 'Lax'
			]);

		// delete session
			// SEC-080: rotate the session id before destroying it. This
			// ensures that any cached references to the old session id (e.g.
			// long-running tabs, browser back/forward cache) cannot be used
			// by a network-local attacker if the session store lags the
			// destroy, and aligns with the rotation-on-login posture (SEC-004).
			$_SESSION = [];
			if (session_status() === PHP_SESSION_ACTIVE) {
				try {
					session_regenerate_id(true);
				} catch (Throwable $e) {
					debug_log(__METHOD__
						. ' SEC-080 session_regenerate_id failed: ' . $e->getMessage()
						, logger::WARNING
					);
				}
				session_destroy();
			}

		// debug
			debug_log(__METHOD__
				." Unset session and cookie. cookie_name/session_name: $cookie_name "
				, logger::DEBUG
			);


		// saml logout
			if (defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
				# code...
			}

		return true;
	}//end Quit



	/**
	* LOGIN_ACTIVITY_REPORT
	* Write a structured login/logout event to the activity logger.
	*
	* Wraps the logger::$obj['activity']->log_message() call used throughout Login(),
	* Login_SAML(), and Quit() so all authentication events share a uniform structure.
	* The base message is merged with the optional $activity_data array (keys: result,
	* cause, username, browser, etc.) into the data payload sent to the logger.
	*
	* Events are scoped to the login ontology tipo (get_login_tipo() → 'dd229') and
	* attributed to the currently logged-in user via logged_user_id() — which may be 0
	* for denied attempts where no session exists yet.
	*
	* @param string $msg            - human-readable event description (written to the log)
	* @param string $login_label    - normalised action label ('LOG IN' or 'LOG OUT')
	* @param array|null $activity_data = null - optional associative array of event metadata
	* @return void
	*/
	public static function login_activity_report( string $msg, string $login_label, ?array $activity_data=null ) : void {

		// data base
			$data = [
				'msg' => $msg
			];
			// append activity_data if exists
			if(!empty($activity_data) && is_array($activity_data)) {
				$data = [...$data, ...$activity_data];
			}

		// LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATA(array of related info)
			logger::$obj['activity']->log_message(
				$login_label,
				logger::INFO,
				self::get_login_tipo(),
				null,
				$data,
				logged_user_id() // int user_id
			);
	}//end login_activity_report



	/**
	* CHECK_ROOT_HAS_DEFAULT_PASSWORD
	* Return true when the root (super-user) account has no password set, signalling
	* that the installation is still in its initial unconfigured state.
	*
	* Reads the component_password for section_id -1 (the virtual root user).
	* If the stored value is empty or absent, the password has not been set since
	* installation (matching the SU_DEFAULT_PASSWORD sentinel ''), and the installer
	* UI should prompt the administrator to create one.
	*
	* @return bool - true when the root password is unset (still at factory default),
	*                false when a password has been stored
	*/
	public static function check_root_has_default_password() : bool {

		$component = component_common::get_instance(
			'component_password',
			DEDALO_USER_PASSWORD_TIPO,
			-1,
			'edit',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$data = $component->get_data();

		if (empty($data) || empty($data[0]->value)) {
			return true;
		}

		return false;
	}//end check_root_has_default_password



	/**
	* GET_STRUCTURE_CONTEXT
	* Build and return the dd_object that describes the login form to the client.
	*
	* Overrides the common::get_structure_context() contract to produce a login-specific
	* context payload. The returned dd_object's properties include:
	*  - login_items: array of {tipo, model, label} descriptors for each child component
	*    (username field, password field, login button, etc.) derived from the ontology
	*    children of dd229.
	*  - info: array of build/version entries exposed to the login page UI:
	*    entity, code version, code build, data version, ontology version.
	*    On development servers (DEDALO_ENTITY==='development' && DEVELOPMENT_SERVER===true)
	*    the DB connection user and database name are also included.
	*  - demo_user: present only when DEDALO_ENTITY==='dedalo_demo'; supplies hardcoded
	*    demo credentials so the login page can pre-fill the form.
	*    (!) Do not ship this branch in a production entity.
	*  - saml_config: boolean true when SAML_CONFIG is defined; triggers the SAML login
	*    button on the client without exposing any sensitive SAML configuration detail.
	*
	* @param int $permissions = 1           - passed through to parent; currently unused here
	* @param bool $add_request_config = false - passed through to parent; currently unused here
	* @return dd_object - fully populated context object for the login area
	*/
	public function get_structure_context(int $permissions=1, bool $add_request_config=false) : dd_object {

		// short vars
			$model	= 'login';
			$tipo	= $this->get_tipo(); // get_login_tipo dd229
			$mode	= $this->get_mode();
			$label	= $this->get_label();
			$lang	= $this->get_lang();

		// properties
			$properties = $this->get_properties();
			if (empty($properties)) {
				$properties = new stdClass();
			}
			$properties->login_items = [];

			// login_items
				$children = ontology_node::get_ar_children($tipo);
				foreach ($children as $children_tipo) {
					$item = (object)[
						'tipo'	=> $children_tipo,
						'model'	=> ontology_node::get_model_by_tipo($children_tipo,true),
						'label'	=> ontology_node::get_term_by_tipo($children_tipo, DEDALO_APPLICATION_LANG, true, true)
					];
					$properties->login_items[] = $item;
				}

		// Dedalo  info
			$properties->info   = [];
		// entity (from config)
			$properties->info[] = [
				'type'	=> 'dedalo_entity',
				'label'	=> 'Dédalo entity',
				'value'	=> DEDALO_ENTITY
			];
		// dedalo version
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Code version',
				'value'	=> DEDALO_VERSION
			];
		// build
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Code Build',
				'value'	=> DEDALO_BUILD
			];
		// dedalo data version
			$properties->info[] = [
				'type'	=> 'data_version',
				'label'	=> 'Data version',
				'value'	=> implode('.', get_current_data_version())
			];
		// ontology version
			$ontology_node		= ontology_node::get_instance('dd1');
			$dd1_properties		= $ontology_node->get_properties();
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Ontology version',
				'value'	=> [
					$dd1_properties->version ?? null,
					$dd1_properties->date ?? null
				]
			];

		// development server only
			if (DEDALO_ENTITY==='development' && DEVELOPMENT_SERVER===true) {
				// database user (only developer)
					$properties->info[] = [
						'type'	=> 'db_user',
						'label'	=> 'DB user',
						'value'	=> DEDALO_USERNAME_CONN." -> ".DEDALO_DATABASE_CONN
					];
				// db info
					$properties->info[] = [
						'type'	=> 'db_user',
						'label'	=> 'DB info',
						'value'	=> [DEDALO_DATABASE_CONN, DEDALO_HOSTNAME_CONN, DEDALO_USERNAME_CONN]
					];
			}

		// demo user
		// Demo is an account used to open and public demo installation
		// if depends of the entity name, do not used in production.
			if(DEDALO_ENTITY==='dedalo_demo'){

				$demo_user = new stdClass();
					$demo_user->user	= 'dedalo';
					$demo_user->pw		= '76&_MbdCs3#17_Vhm';

				$properties->info[] = [
					'type'	=> 'demo_user',
					'label'	=> 'Demo user',
					'value'	=> $demo_user
				];
			}

		// saml. If set, a button will be displayed on the login form.
			if (defined('SAML_CONFIG')) {
				// format:
				// [
				//	  'active'		=> true,
				//	  'url'			=> DEDALO_CORE_URL . '/login/saml',
				//	  'logout_url'	=> 'https://domain/SAML/SSO',
				//	  'debug'		=> true,
				//	  'code'		=> 'urn:oid:4.7.2.9.3.8.5926',
				//	  'idp_ip'		=> ['127.0.0.1']
				// ]
				$properties->saml_config = true;
			}

		// dd_object
			$dd_object = new dd_object((object)[
				'label'			=> $label,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'lang'			=> $lang,
				'mode'			=> $mode,
				'properties'	=> $properties
			]);


		return $dd_object;
	}//end get_structure_context


	/**
	* GET_V6_ROOT_DB_DATA
	* Return a synthetic result set representing the v6 root user during the v6→v7 migration.
	*
	* The root user (section_id = -1) is a virtual superuser that does not have a real row
	* in the matrix_users JSONB table. This method provides the hard-coded section_id array
	* [-1] so that the Login() credential flow can locate and authenticate the root account
	* even before a native v7 user record has been created.
	*
	* (!) PROVISIONAL: intended only for the v6-to-v7 transition period.
	*     Remove this method when all deployments have migrated beyond v7.0.0.
	*
	* @return array - single-element array containing integer -1
	*/
	public static function get_v6_root_db_data(): array {

		return [-1];

	}//end get_v6_root_db_data



	/**
	* GET_USERS_WITH_NAME
	* Find user section IDs in matrix_users whose DEDALO_USER_NAME_TIPO value equals $username.
	*
	* Uses a direct JSONB containment query against the matrix_users table instead of the
	* SQO search path. The SQO alternative is preserved in a commented-out block for reference;
	* the direct query is preferred here because:
	*  - The SQO path enforces section_id > 0, which would exclude the root user (-1).
	*  - This code runs before session auth is established, so bypassing the SQO security
	*    filters is intentional — the login process is itself the auth gate.
	* The query uses a JSONB containment operator ($1) with a parameterised value to prevent
	* SQL injection. pg_escape_string() is applied to $username before building the JSON
	* string parameter; note that the value is bound as a prepared parameter ($1), so the
	* pg_escape_string call adds a second layer of escaping for the inline JSON string.
	* Results are ordered by section_id ASC. The LIMIT 1 means this function returns at most one
	* row; the duplicate-username ("ambiguous user") guard in Login() (user_count > 1) is therefore
	* not reachable through this method alone — it is a defensive check left in place should
	* the query ever be relaxed or a different look-up path is used.
	*
	* @param string $username - login name from the login form (e.g. 'Pepe')
	* @return array - ordered list of matching section_id integers (usually 0 or 1 entries)
	* @throws Exception - when the database query fails
	*/
	public static function get_users_with_name( string $username ) : array {

		// SQO way
			// $sqo = json_decode('
			// 	{
			// 	  "select": [{"column": "section_id"}],
			// 	  "section_tipo": [
			// 	    "'.DEDALO_SECTION_USERS_TIPO.'"
			// 	  ],
			// 	  "filter": {
			// 	    "$and": [
			// 	      {
			// 	        "q": [
			// 	          "'.$username.'"
			// 	        ],
			// 	        "q_operator": "==",
			// 	        "path": [
			// 	          {
			// 	            "section_tipo": "'.DEDALO_SECTION_USERS_TIPO.'",
			// 	            "component_tipo": "'.DEDALO_USER_NAME_TIPO.'",
			// 	            "model": "component_input_text",
			// 	            "name": "User"
			// 	          }
			// 	        ],
			// 	        "type": "jsonb",
			// 	        "lang": "lg-nolan"
			// 	      }
			// 	    ]
			// 	  },
			// 	  "limit": 1,
			// 	  "skip_projects_filter": true
			// 	}
			// ');
			// $search = search::get_instance($sqo);
			// $db_result = $search->search();
			// $ar_section_id = [];
			// foreach ($db_result as $row) {
			// 	$ar_section_id[] = (int)$row->section_id;
			// }

		$conn = DBi::_getConnection();
		$username = pg_escape_string($conn, $username);

		$params = [
			'{"'.DEDALO_USER_NAME_TIPO.'":[{"value": "'.$username.'"}]}'
		];

		// direct way. Note that this search do not has the restrictions of the SQO way (section_id > 0)
			$sql  = 'SELECT section_id' . PHP_EOL;
			$sql .= 'FROM matrix_users' . PHP_EOL;
			$sql .= 'WHERE section_tipo = \'' . DEDALO_SECTION_USERS_TIPO .'\'' . PHP_EOL;
			$sql .= 'AND matrix_users.string::jsonb @> $1' . PHP_EOL;
			$sql .= 'ORDER BY section_id ASC'  . PHP_EOL;
			$sql .= 'LIMIT 1';

			$result = matrix_db_manager::exec_search($sql, $params);

			if (!$result) {
				return [];
			}

			// Fetch all results
			$ar_section_id = [];
			while ($row = pg_fetch_assoc($result)) {
				$ar_section_id[] = (int)$row['section_id'];
			}


		return $ar_section_id ?: [];
	}//end get_users_with_name



	/**
	* GET_USERS_WITH_CODE
	* Find user section IDs in matrix_users whose dd1053 (user code) component value equals $code.
	*
	* This is the SAML counterpart of get_users_with_name(): the code (DNI, passport number, etc.)
	* is the external identifier sent by the identity provider in the SAML assertion and stored
	* in the user record under tipo dd1053.
	* Unlike get_users_with_name(), the $code value here is encoded via json_encode() (not
	* pg_escape_string) before being bound as the $1 parameter — AUTH-03 fix: JSON-encoding
	* correctly handles structural characters (", \) in the code without the double-escaping
	* risk of combining pg_escape_string with a prepared statement.
	* The JSONB containment document structure mirrors the component_input_text storage format:
	*   { "dd1053": [{"lang": "lg-nolan", "value": "<code>"}] }
	*
	* @param string $code - user identifier from the SAML assertion (e.g. '25748925G')
	* @return array|false - ordered list of matching section_id integers, or false on query error
	* @throws Exception - when the database query fails
	*/
	public static function get_users_with_code( string $code ) : array|false {

		$code_component_tipo = 'dd1053';

		// AUTH-03: build the JSONB containment document with json_encode so structural
		// characters in $code (", \) are escaped correctly instead of breaking the JSON.
		// $code is bound as a prepared-statement parameter ($1), so it needs JSON
		// escaping here, NOT SQL escaping (the previous pg_escape_string double-escaped it).
		$params = [
			json_encode([$code_component_tipo => [['lang' => 'lg-nolan', 'value' => $code]]], JSON_UNESCAPED_UNICODE)
		];

		// direct data way
			$sql  = 'SELECT section_id' . PHP_EOL;
			$sql .= 'FROM matrix_users' . PHP_EOL;
			$sql .= 'WHERE section_tipo = \'' . DEDALO_SECTION_USERS_TIPO .'\'' . PHP_EOL;
			$sql .= 'AND matrix_users.string::jsonb @> $1' . PHP_EOL;
			$sql .= 'ORDER BY section_id ASC' . PHP_EOL;
			$sql .= 'LIMIT 1';

			$result = matrix_db_manager::exec_search($sql, $params);

			if (!$result) {
				return [];
			}

			// Fetch all results
			$ar_section_id = [];
			while ($row = pg_fetch_assoc($result)) {
				$ar_section_id[] = (int)$row['section_id'];
			}


		return $ar_section_id ?: [];
	}//end get_users_with_code



}//end login class



/**
* CLASS EXEC
* Lightweight utility wrapper for launching and managing background shell processes.
*
* Provides three primitives — background(), is_running(), and kill() — for spawning
* OS-level processes via shell_exec()/exec() and checking or terminating them by PID.
*
* (!) This class appears to be legacy infrastructure left over from v6 / early v7
*     development. In v7 the preferred pattern for background work is
*     dd_cache::process_and_cache_to_file() with wait=false (used in
*     init_user_login_sequence for DB ANALYZE and security-access cache generation).
*     This class is no longer referenced within class.login.php itself and its
*     continued presence here may be unintentional. Flag for removal review.
*
* @package Dédalo
* @subpackage Core
*/
class exec {
	/**
	* BACKGROUND
	* Spawn a shell command in the background using nohup and return its PID string.
	*
	* When $Priority is non-zero the command is wrapped with nice -n $Priority to
	* adjust its CPU scheduling priority.
	*
	* (!) Uses shell_exec() with an unsanitised $Command argument — callers are
	*     responsible for escaping or validating the command string before passing it.
	*
	* @param mixed $Command  - shell command string to execute in the background
	* @param mixed $Priority - nice(1) priority level; 0 disables nice wrapping
	* @return mixed          - PID string from "echo $!" on success, null on failure
	*/
	function background($Command, $Priority = 0){
	   if($Priority)
		   $PID = shell_exec("nohup nice -n $Priority $Command > /dev/null & echo $!");
	   else
		   $PID = shell_exec("nohup $Command > /dev/null & echo $!");
	   return($PID);
   }
   /**
	* IS_RUNNING
	* Check whether a process identified by $PID is still active.
	*
	* Runs 'ps $PID' and counts the output lines; two or more lines (header + process row)
	* means the process exists.
	*
	* @param mixed $PID - process identifier returned by background()
	* @return bool      - true when the process is still running, false otherwise
	*/
   function is_running($PID){
	   exec("ps $PID", $ProcessState);
	   return(count($ProcessState) >= 2);
   }
   /**
	* KILL
	* Send SIGKILL to a running process and return whether it was terminated.
	*
	* Checks is_running() first; if the process is not found, returns false immediately.
	*
	* @param mixed $PID - process identifier returned by background()
	* @return bool      - true when SIGKILL was sent, false when the process was not running
	*/
   function kill($PID){
	   if(exec::is_running($PID)){
		   exec("kill -KILL $PID");
		   return true;
	   }else return false;
   }
}//end exec
