<?php

/**
 * Abstract DbSessionHandler. Test and working for MySQL.
 *
 * Recommended database session table.
 *
 * ```sql
 * CREATE TABLE `sessions` (
 *   `id` varchar(63) CHARACTER SET ascii NOT NULL DEFAULT '',
 *   `data` text,
 *   `expire` int(10) unsigned DEFAULT NULL,
 *   PRIMARY KEY (`id`),
 *   KEY `expire` (`expire`)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 * ```
 *
 * @author KahWee Teng <t@kw.sg>
 * @version 1.1
 * @link http://kw.sg/
 * @copyright Copyright &copy; 2012 KahWee Teng
 * @license http://www.opensource.org/licenses/mit-license.php
 */
abstract class DbSessionHandler {

	/**
	 * @var object PDO object
	 */
	private $pdo = null;

	/**
	 * @var string Sessiondb's table name
	 */
	protected $session_db_table = 'sessions';

	/**
	 * @var string Sessiondb's id column name
	 */
	protected $session_db_column_id = 'id';

	/**
	 * @var string Sessiondb's data column name
	 */
	protected $session_db_column_data = 'data';

	/**
	 * @var string Sessiondb's expire/access column name. This is in time().
	 */
	protected $session_db_column_expire = 'expire';

	/**
	 * @var string Session's name. Defaults to PHPSESSID
	 */
	protected $session_name = null;

	/**
	 * @var integer Session cache expiry time. This is in minutes.
	 */
	protected $session_cache_expire_minutes = 120; #2 hours
	/**
	 * @var string The Data Source Name, or DSN, contains the information required to connect to the database.
	 * @link http://www.php.net/manual/en/pdo.construct.php
	 */
	protected $pdo_data_source_name = '';

	/**
	 * @var string The user name for the DSN string. This parameter is optional for some PDO drivers.
	 */
	protected $pdo_username = '';

	/**
	 * @var string The password for the DSN string. This parameter is optional for some PDO drivers.
	 */
	protected $pdo_password = '';

	/**
	 * @var integer PDO time out in seconds, defaults to 1.
	 */
	protected $pdo_timeout_seconds = 1;

	/**
	 * @var boolean Start immediately after construction
	 */
	protected $session_auto_start = false;

	public function __construct($start=true) {
		session_cache_expire($this->session_cache_expire_minutes); #2 hours
		$cache_expire = session_cache_expire();
		session_cache_limiter('private');
		$cache_limiter = session_cache_limiter();
		session_set_save_handler(
			array(&$this, "open"), array(&$this, "close"), array(&$this, "read"), array(&$this, "write"), array(&$this, "destroy"), array(&$this, "gc")
		);
		if (!is_null($this->session_name)) {
			session_name($this->session_name);
		}
		if ($this->session_auto_start) {
			@session_start();
		}
		#register_shutdown_function(array($this,'close'));
	}

	/**
	 * Initialize session
	 *
	 * @return boolean
	 */
	public function open() {
		try {
			$this->pdo = new PDO(
					$this->pdo_data_source_name,
					$this->pdo_username,
					$this->pdo_password,
					array('PDO::ATTR_TIMEOUT' => $this->pdo_timeout_seconds)
			);
			return true;
		} catch (PDOException $e) {
			echo 'Connection to session database failed: ' . $e->getMessage();
		}
		return false;
	}

	/**
	 * Read session data
	 *
	 * @param string $id Session id
	 * @return string Session data if available, empty string if not.
	 */
	public function read($id) {
		$sth = $this->pdo->prepare(<<<SQL
SELECT `{$this->session_db_column_data}`
FROM `{$this->session_db_table}`
WHERE `{$this->session_db_column_id}` = :id;
SQL
		);
		$sth->execute(array(':id' => $id));
		if ($rec = $sth->fetch()) {
			return $rec['data'];
		}
		return '';
	}

	/**
	 * Write session data
	 *
	 * @param string $id Session id
	 * @param string $data Session data to be written
	 * @return type
	 */
	public function write($id, $data) {
		$sth = $this->pdo->prepare(<<<SQL
REPLACE INTO {$this->session_db_table}
(
	`{$this->session_db_column_id}`,
	`{$this->session_db_column_data}`,
	`{$this->session_db_column_expire}`
)
VALUES (:id, :data, :expire);
SQL
		);
		$result = $sth->execute(array(':id' => $id, ':data' => $data, ':expire' => time() + $this->getTimeout()));
		return $result;
	}

	/**
	 * Destroy a session
	 *
	 * @param string $id Session id
	 * @return type
	 */
	public function destroy($id) {
		$sth = $this->pdo->prepare(<<<SQL
DELETE FROM `{$this->session_db_table}` WHERE `{$this->session_db_column_id}` = :id;
SQL
		);
		$result = $sth->execute(array(':id' => $id));
		return $result;
	}

	/**
	 * Cleanup old sessions
	 * Garbage collection.
	 *
	 * @param string $maxlifetime Sessions that have not updated for the last maxlifetime seconds will be removed.
	 * @return mixed The return value (usually TRUE on success, FALSE on failure).
	 */
	public function gc($maxlifetime) {
		$old = time() - $maxlifetime;
		$sth = $this->pdo->prepare(<<<SQL
DELETE FROM `{$this->session_db_table}` WHERE `{$this->session_db_column_expire}` < :old;
SQL
		);
		$result = $sth->execute(array(':old' => $old));
		return $result;
	}

	/**
	 * Close the session
	 *
	 * @return boolean
	 */
	public function close() {
		$this->pdo = null;
		return true;
	}

	public function __destruct() {
		session_write_close();
	}

	/**
	 * @return integer the number of seconds after which data will be seen as 'garbage' and cleaned up, defaults to 1440 seconds.
	 */
	public function getTimeout() {
		return (int) ini_get('session.gc_maxlifetime');
	}

}

?>