import { expect, test, describe } from "bun:test";
import { validate_backup_request } from "../lib/db_admin";

describe('db_admin backup_database validation', () => {

	test('rejects invalid database names', () => {
		expect(validate_backup_request(undefined, '/backups/x.sql')).not.toBeNull();
		expect(validate_backup_request('', '/backups/x.sql')).not.toBeNull();
		expect(validate_backup_request('web db', '/backups/x.sql')).not.toBeNull();   // space
		expect(validate_backup_request('web;db', '/backups/x.sql')).not.toBeNull();   // injection chars
		expect(validate_backup_request('web`db', '/backups/x.sql')).not.toBeNull();
	});

	test('rejects invalid target files', () => {
		expect(validate_backup_request('web_dedalo', undefined)).not.toBeNull();
		expect(validate_backup_request('web_dedalo', '')).not.toBeNull();
		expect(validate_backup_request('web_dedalo', 'relative/path.sql')).not.toBeNull();   // not absolute
		expect(validate_backup_request('web_dedalo', '/backups/../etc/x.sql')).not.toBeNull(); // traversal
		expect(validate_backup_request('web_dedalo', '/backups/x.txt')).not.toBeNull();       // wrong extension
	});

	test('accepts valid request', () => {
		expect(validate_backup_request('web_dedalo', '/dedalo/backups/mysql/2026-06-11_web_dedalo_1.sql')).toBeNull();
		expect(validate_backup_request('web-murapa', '/backups/dump.sql')).toBeNull();
	});
});
