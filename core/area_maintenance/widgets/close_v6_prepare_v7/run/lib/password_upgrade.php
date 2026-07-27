<?php declare(strict_types=1);
/**
* PASSWORD_UPGRADE — convert v6 credentials to Argon2id (SEC-001).
*
* v6 does NOT hash passwords: component_password::encrypt_password() calls
* dedalo_encrypt_openssl(), i.e. REVERSIBLE AES-256-CBC keyed on DEDALO_INFORMATION.
* The v7 engines only accept one-way hashes — the TS server refuses such an account with
* "still has a legacy (pre-Argon2) password hash" and the PHP engine upgrades it lazily,
* on the user's next successful login (component_password docblocks → login::Login()).
*
* A migration cannot rely on that lazy path: after the cutover there is no PHP server left
* to log into, and every account would be locked out until someone logged in somewhere that
* no longer exists. Because the stored value is reversible, the migration can do eagerly and
* for everyone what the lazy path does one user at a time: recover the plaintext, hash it,
* store the hash.
*
* No crypto is implemented here. The engine's own methods are used, so the hashes are byte-
* for-byte what the PHP engine would have produced:
*   dedalo_decrypt_openssl()             recover the plaintext from the legacy blob
*   component_password::hash_password()  password_hash($plain, PASSWORD_ARGON2ID)
*   component_password::verify_password() round-trip proof before anything is written
*
* Safety rules:
*  - a row is written ONLY when the decrypt produced a non-empty plaintext AND the fresh
*    hash verifies against it. Hashing a failed decrypt would lock the user out permanently,
*    so those rows are reported instead, never written;
*  - already-hashed rows are skipped, so the step is idempotent and re-runnable;
*  - plaintexts are never logged, echoed or returned — only counts and usernames.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
final class prepare_v7_password_upgrade {

	/** v7 user storage (mirrors src/core/security/auth.ts) */
	private const USERS_SECTION_TIPO	= 'dd128';
	private const USERNAME_COMPONENT	= 'dd132';
	private const PASSWORD_COMPONENT	= 'dd133';


	/**
	* CAPABILITY
	* Can THIS PHP produce the hashes? Argon2 in password_hash() is a compile-time option
	* (--with-password-argon2), not a version feature, so a perfectly current PHP can lack it.
	* The engine itself calls PASSWORD_ARGON2ID unconditionally, so a build without it cannot
	* run the v7 PHP engine either — this check surfaces that before the migration writes.
	*
	* @return object { result: bool, msg: string }
	*/
	public static function capability() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		if (!defined('PASSWORD_ARGON2ID')) {
			$response->msg = 'this PHP has no Argon2 support (PASSWORD_ARGON2ID undefined). '
				. 'It was built without --with-password-argon2, so passwords cannot be converted '
				. 'and the v7 PHP engine could not verify logins either. Rebuild/replace PHP with '
				. 'Argon2 support, then re-run.';
			return $response;
		}
		if (!class_exists('component_password') || !method_exists('component_password', 'hash_password')) {
			$response->msg = 'the bundled engine does not expose component_password::hash_password().';
			return $response;
		}

		$response->result	= true;
		$response->msg		= 'Argon2id available (PASSWORD_ARGON2ID)';
		return $response;
	}//end capability


	/**
	* RUN
	* @param bool $save - false = report only, write nothing
	* @return object {
	*   result: bool, total: int, converted: int, already: int, empty: int,
	*   failed: array<int,string>, msg: string
	* }
	*/
	public static function run(bool $save) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->total		= 0;
			$response->converted	= 0;
			$response->already		= 0;
			$response->empty		= 0;
			$response->failed		= [];
			$response->msg			= '';

		$capability = self::capability();
		if ($capability->result !== true) {
			$response->msg = $capability->msg;
			return $response;
		}

		$sql = 'SELECT section_id, string FROM "matrix_users"'
			. ' WHERE section_tipo = $1 AND string ? $2 ORDER BY section_id';
		$result = matrix_db_manager::exec_search($sql, [
			self::USERS_SECTION_TIPO,
			self::PASSWORD_COMPONENT
		], false);
		if ($result === false) {
			$response->msg = 'Could not read matrix_users.';
			return $response;
		}

		while ($row = pg_fetch_assoc($result)) {

			$response->total++;

			$section_id	= (int)$row['section_id'];
			$string		= json_decode((string)$row['string']);
			$username	= (string)($string->{self::USERNAME_COMPONENT}[0]->value ?? ('section_id ' . $section_id));
			$stored		= (string)($string->{self::PASSWORD_COMPONENT}[0]->value ?? '');

			if ($stored === '') {
				$response->empty++;
				continue;
			}
			if (component_password::is_legacy_hash($stored) === false) {
				$response->already++; // already Argon2id/bcrypt — idempotent skip
				continue;
			}

			// recover the plaintext from the reversible v6 blob
			$plain = '';
			try {
				$plain = (string) dedalo_decrypt_openssl($stored);
			} catch (\Throwable $e) {
				$plain = '';
			}
			if ($plain === '') {
				$response->failed[] = $username . ' (could not decrypt the stored value)';
				continue;
			}

			// hash + PROVE the hash accepts that plaintext before touching the row
			$hash = component_password::hash_password($plain);
			[$verified, ] = component_password::verify_password($plain, $hash);
			if ($verified !== true) {
				$response->failed[] = $username . ' (hash did not verify; row left untouched)';
				continue;
			}

			if ($save !== true) {
				$response->converted++; // dry run: this is what WOULD be written
				continue;
			}

			$string->{self::PASSWORD_COMPONENT}[0]->value = $hash;

			$update = 'UPDATE "matrix_users" SET string = $1::jsonb WHERE section_tipo = $2 AND section_id = $3';
			$written = matrix_db_manager::exec_search($update, [
				json_encode($string, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
				self::USERS_SECTION_TIPO,
				$section_id
			], false);

			if ($written === false) {
				$response->failed[] = $username . ' (UPDATE failed)';
				continue;
			}
			$response->converted++;
		}
		pg_free_result($result);

		$response->result	= empty($response->failed);
		$response->msg		= ($save ? 'converted ' : 'would convert ') . $response->converted
			. ' of ' . $response->total . ' user(s)'
			. ' | already hashed: ' . $response->already
			. ' | empty: ' . $response->empty
			. ' | failed: ' . count($response->failed);

		return $response;
	}//end run


}//end prepare_v7_password_upgrade
