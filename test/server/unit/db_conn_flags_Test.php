<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/db/class.DBi.php';

/**
* DB_CONN_FLAGS_TEST
* Unit tests for DBi::build_conn_flags() — the pure builder that turns
* host / port / user / socket values into the -h/-p/-U flag fragment used
* by every server-side psql / pg_dump invocation.
*
* The contract: values are always shell-escaped (defence-in-depth, aligns the
* runtime path with the install path), an empty host falls back to the socket
* path (socket-only installs), and empty values emit no flag at all (so a fresh
* / unconfigured install never produces a broken "-h " fragment).
*/
final class db_conn_flags_Test extends TestCase {

	public function test_normal_host_port_user_are_escaped() : void {
		$flags = DBi::build_conn_flags('localhost', 5432, 'dedalo', null);
		$this->assertSame("-h 'localhost' -p '5432' -U 'dedalo'", $flags);
	}

	public function test_socket_used_as_host_when_host_empty() : void {
		// socket-only install: no TCP host, libpq/psql receives the socket dir as -h
		$flags = DBi::build_conn_flags('', 5432, 'dedalo', '/var/run/postgresql');
		$this->assertSame("-h '/var/run/postgresql' -p '5432' -U 'dedalo'", $flags);
	}

	public function test_real_host_wins_over_socket() : void {
		$flags = DBi::build_conn_flags('db.example.com', 5432, 'dedalo', '/var/run/postgresql');
		$this->assertSame("-h 'db.example.com' -p '5432' -U 'dedalo'", $flags);
	}

	public function test_metacharacters_in_host_are_neutralised() : void {
		// a hostname carrying shell metacharacters must not break out of the -h arg
		$flags = DBi::build_conn_flags('db.example.com -o /tmp/x', 5432, 'dedalo', null);
		$this->assertSame("-h 'db.example.com -o /tmp/x' -p '5432' -U 'dedalo'", $flags);
	}

	public function test_empty_host_and_socket_emit_no_host_flag() : void {
		// fresh / unconfigured install: never emit a broken "-h " fragment;
		// let libpq resolve its own default host
		$flags = DBi::build_conn_flags('', 5432, 'dedalo', '');
		$this->assertSame("-p '5432' -U 'dedalo'", $flags);
	}

	public function test_empty_port_emits_no_port_flag() : void {
		$flags = DBi::build_conn_flags('localhost', null, 'dedalo', null);
		$this->assertSame("-h 'localhost' -U 'dedalo'", $flags);
	}

	public function test_empty_user_emits_no_user_flag() : void {
		$flags = DBi::build_conn_flags('localhost', 5432, '', null);
		$this->assertSame("-h 'localhost' -p '5432'", $flags);
	}
}
