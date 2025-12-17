<?php declare(strict_types=1);

// require __DIR__ . '/../src/autoload.php';
// require __DIR__ . '/autoload.php';
// require dirname(__FILE__, 3) . '/lib/vendor/autoload.php';

// SHOW_DEBUG. Overwrite config SHOW_DEBUG
	define('SHOW_DEBUG', true);

// TEST_USER_ID: [
	// -1, // root development user
	// 	1, // admin general (no projects)
	// 	2 // regular user
	// ]
	define('TEST_USER_ID', 1); // DEDALO_SUPERUSER

// IS_UNIT_TEST
	define('IS_UNIT_TEST', true);

// config file
	require_once dirname(__FILE__, 3) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		die("Error. Only development servers can use this method.");
	}

// check is in maintenance mode
	if (DEDALO_MAINTENANCE_MODE || DEDALO_MAINTENANCE_MODE_CUSTOM) {
		die("Error. System is in maintenance mode. Unable to test in this mode.");
	}

// host test
	define('TEST_HOST',
		// 'https://localhost:8443/'
		// 'https://localhost:7443'
		'http://localhost:8080'
	);

// DEDALO_API_URL_UNIT_TEST. Used only to internal test. Define as full URL with protocol, domain and port
	define('DEDALO_API_URL_UNIT_TEST',
		TEST_HOST . DEDALO_ROOT_WEB .'/core/api/v1/json/'
	);

// PHPUnit classes
	// use PHPUnit\Framework\TestCase;
	// use PHPUnit\Framework\Attributes\TestDox;

// message CLI
	$icon = !SHOW_DEBUG ? '😀' : '🧐';
	$msg = "Dédalo ".DEDALO_VERSION." testing using user id: ".TEST_USER_ID .' - SHOW_DEBUG: ' .to_string(SHOW_DEBUG) . ' - ' . $icon;
	fwrite(STDERR, PHP_EOL
		. print_r($msg, TRUE) . PHP_EOL
	);

// require files
	require_once 'components/data.php';
	require_once 'components/elements.php';
	require_once dirname(__FILE__) . '/login/login_Test.php';

// PHPUnitUtil reflection
	class PHPUnitUtil
	{
		public static function callMethod($obj, $name, array $args) {
			$class = new \ReflectionClass($obj);
			$method = $class->getMethod($name);
			// $method->setAccessible(true); // Use this if you are running PHP older than 8.1.0
			return $method->invokeArgs($obj, $args);
		}
	}

// logout. Delete sessions and cache files
	$user_id = TEST_USER_ID; // Defined in bootstrap
	if (login::is_logged()) {
		$result = login_test::logout($user_id);
	}

// add PostgreSQL function to duplicate table with independent sequences
	$sql = "
		CREATE OR REPLACE FUNCTION duplicate_table_with_independent_sequences(
			source_table TEXT,
			target_table TEXT,
			reset_sequence BOOLEAN DEFAULT FALSE,
			start_value BIGINT DEFAULT 1
		) RETURNS void AS $$
		DECLARE
			col_record RECORD;
			max_val BIGINT;
			seq_name TEXT;
			new_seq_name TEXT;
			sequence_start BIGINT;
		BEGIN
			-- Create the table structure without defaults
			EXECUTE format('CREATE TABLE %I (LIKE %I INCLUDING CONSTRAINTS INCLUDING INDEXES EXCLUDING DEFAULTS)',
							target_table, source_table);

			-- Handle sequences for SERIAL columns
			FOR col_record IN
				SELECT
					column_name,
					column_default,
					REPLACE(SPLIT_PART(column_default, '''', 2), source_table || '_', '') as base_seq_name
				FROM information_schema.columns
				WHERE table_name = source_table
				AND column_default LIKE 'nextval%'
			LOOP
				-- Create new sequence name
				new_seq_name := target_table || '_' || col_record.base_seq_name;

				-- Determine sequence start value
				IF reset_sequence THEN
					sequence_start := start_value;
				ELSE
					-- Get current maximum value from source table
					EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I',
									col_record.column_name, source_table) INTO max_val;
					sequence_start := max_val + 1;
				END IF;

				-- Create new sequence
				EXECUTE format('CREATE SEQUENCE %I START WITH %s', new_seq_name, sequence_start);

				-- Set new default
				EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(''%I''::regclass)',
								target_table, col_record.column_name, new_seq_name);
			END LOOP;

			RAISE NOTICE 'Table % duplicated successfully with independent sequences', target_table;
		END;
		$$ LANGUAGE plpgsql;
	";
	pg_query(DBi::_getConnection(), $sql);
