/**
 * Shared test-session hygiene (S1-18). Call once at module load of any test
 * file that creates sessions: registers an afterAll that wipes the scratch
 * session store (provided by test/preload/session_db.ts), so leaked sessions
 * and throttle attempts never accumulate across the run. If the store is NOT
 * the test override, resetSessionStoreForTests throws loudly — this helper can
 * never silently wipe the live file.
 */
import { afterAll } from 'bun:test';
import { resetSessionStoreForTests } from '../../src/core/security/session_store.ts';

export function registerSessionCleanup(): void {
	afterAll(() => {
		resetSessionStoreForTests();
	});
}
