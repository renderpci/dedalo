/**
 * LOCAL-DB STORE tripwire (client IndexedDB).
 *
 * The object stores are a FIXED set, created once in data_manager.get_local_db's
 * `onupgradeneeded` ('status', 'rqo', 'context', 'data', 'ontology', 'pagination').
 * A caller cannot invent a store per feature: naming one that was never created
 * makes `db.transaction(store)` throw
 *
 *     NotFoundError: One of the specified object stores was not found
 *
 * …from inside a promise, i.e. as an unhandled rejection in the console rather
 * than anywhere near the code that caused it. The trap is that the two arguments
 * are easy to swap — the STORE is the second argument, and the feature's own name
 * is the RECORD id, not a store. That is exactly how tool_import_dedalo_csv
 * shipped `set_local_db_data({id:'status'}, 'process_import_dedalo_csv')`.
 *
 * So: every store literal any client/tool passes must be one the DB actually
 * creates. Derived from the source on both sides — add a store to get_local_db and
 * this keeps passing; invent one at a call site and it fails here, not in a user's
 * console.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_MANAGER = 'client/dedalo/core/common/js/data_manager.js';

/** The stores the DB actually creates (the only legal second argument). */
function createdStores(): Set<string> {
	const src = readFileSync(DATA_MANAGER, 'utf-8');
	const stores = new Set<string>();
	for (const match of src.matchAll(/createObjectStore\('([a-z_]+)'/g)) {
		stores.add(match[1] as string);
	}
	return stores;
}

/** Every .js under the client + tools trees. */
function clientJsFiles(): string[] {
	const files: string[] = [];
	const walk = (dir: string): void => {
		let entries: import('node:fs').Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules') continue;
				walk(path);
			} else if (entry.isFile() && entry.name.endsWith('.js')) {
				files.push(path);
			}
		}
	};
	walk('client');
	walk('tools');
	return files;
}

/** Store literals passed to set_/get_local_db_data in one file. */
function storeArgs(src: string): string[] {
	const stores: string[] = [];
	// set_local_db_data({…}, 'store')  — the record object may span lines.
	for (const match of src.matchAll(/set_local_db_data\(\s*\{[\s\S]*?\}\s*,\s*'([a-z_]+)'/g)) {
		stores.push(match[1] as string);
	}
	// get_local_db_data(id, 'store'[, use_cache])
	for (const match of src.matchAll(/get_local_db_data\(\s*[^,]+,\s*'([a-z_]+)'/g)) {
		stores.push(match[1] as string);
	}
	return stores;
}

describe('client IndexedDB stores', () => {
	test('the fixed store set is what we think it is (guards the derivation below)', () => {
		expect([...createdStores()].sort()).toEqual([
			'context',
			'data',
			'ontology',
			'pagination',
			'rqo',
			'status',
		]);
	});

	test('every local-db call names a store the DB actually creates', () => {
		const allowed = createdStores();
		const violations: string[] = [];
		for (const file of clientJsFiles()) {
			for (const store of storeArgs(readFileSync(file, 'utf-8'))) {
				if (!allowed.has(store)) violations.push(`${file}: '${store}'`);
			}
		}
		// A violation throws NotFoundError at runtime, inside a promise, far from
		// the call — so it must be caught here instead.
		expect(violations).toEqual([]);
	});

	test('the CSV import tool keeps NO local-db state (it asks the server instead)', () => {
		const src = readFileSync(
			'tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js',
			'utf-8',
		);
		// The tool used to park its running job_id in IndexedDB — client state
		// duplicating a fact the SERVER owns (it runs the job and its registry
		// records the tool, action and owner). That copy was per-browser, went stale
		// across a server restart, and its store/key pair was a runtime throw waiting
		// to happen. It now asks: get_background_jobs → re-attach.
		expect(storeArgs(src)).toEqual([]);
		expect(src).toContain("self.get_background_jobs('import_files')");
	});
});
